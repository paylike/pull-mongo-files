'use strict';

var fs = require('fs');
var Promise = require('bluebird');
var test = require('tape');
var mongodb = require('mongodb');
var nodeToPull = require('stream-to-pull-stream');
var pull = require('pull-stream');
var pullToPromise = require('pull-to-promise');
var uuid = require('mongo-uuid');

var db = mongodb.connect('mongodb://localhost:'+process.env.MONGODB_PORT+'/pull_mongo_files_test', {
	promiseLibrary: Promise,
});

var mfs = require('../')(mongodb, db);

var ObjectId = mongodb.ObjectId;

var wallpaper = __dirname+'/fixtures/wallpaper.jpg';

var wallpaperAsBuffer = fs.readFileSync(wallpaper);

test.onFinish(function(){
	db
		.call('dropDatabase')
		.return(db)
		.call('close');
});

test('Write', function( t ){
	t.test(function( t ){
		t.plan(2);

		var id = ObjectId();

		var write = pull(
			nodeToPull.source(fs.createReadStream(wallpaper)),
			mfs.write(id)
		)
			.then(err => t.notOk(err));

		Promise
			.join(id, write)
			.spread(mfs.read)
			.tap(file => t.ok(file));
	});


	// Currently emits a warning from the "stream-to-pull-stream" module
	// because the MongoDB GridFS write stream does not implement a "destroy"
	// method.
	//
	// https://github.com/pull-stream/stream-to-pull-stream/blob/master/index.js#L21-L25
	// https://github.com/mongodb/node-mongodb-native/pull/1339

	t.test('Aborting', function( t ){
		t.plan(2);

		var id = ObjectId();

		var count = 0;

		var write = pull(
			function( end, cb ){
				if (end !== null)
					return cb(end);

				if (count++ < 5)
					return cb(null, new Buffer('00', 'hex'));	// write a byte

				cb(new DummyError());
			},
			mfs.write(id)
		)
			.catch(err => t.ok(err));

		Promise
			.join(id, write)
			.spread(mfs.read)
			.then(pullToPromise)
			.catch(err => t.ok(err.message.includes('FileNotFound')));
	});

	t.test('With meta data', function( t ){
		t.plan(2);

		var id = ObjectId();

		var write = pull(
			nodeToPull.source(fs.createReadStream(wallpaper)),
			mfs.write(id, {
				name: 'wallpaper.jpg',
				created: new Date(),
			})
		)
			.then(err => t.notOk(err));

		Promise
			.join(id, write)
			.spread(mfs.read)
			.tap(file => t.ok(file));
	});
});

test('Read', function( t ){
	var id = ObjectId();

	var write = pull(
		nodeToPull.source(fs.createReadStream(wallpaper)),
		mfs.write(id)
	);

	t.test(function( t ){
		t.plan(1);

		Promise
			.join(id, write)
			.spread(mfs.read)
			.then(chunks => pullToPromise(chunks, true))
			.then(Buffer.concat)
			.tap(downloaded => t.ok(downloaded.equals(wallpaperAsBuffer)));
	});

	t.test('Not found', function( t ){
		t.plan(1);

		pullToPromise(mfs.read(ObjectId()))
			.catch(err => t.ok(err.message.includes('FileNotFound')));
	});
});

test('Stat', function( t ){
	var id = ObjectId();

	var write = pull(
		nodeToPull.source(fs.createReadStream(wallpaper)),
		mfs.write(id)
	);

	t.test(function( t ){
		t.plan(1);

		Promise
			.join(id, write)
			.spread(mfs.stat)
			.tap(file => t.deepEqual(file, {
				id: id,
				meta: {},
			}));
	});

	t.test('With meta data', function( t ){
		t.plan(1);

		var id = ObjectId();

		var name = 'wallpaper.jpg';
		var created = new Date();

		var write = pull(
			nodeToPull.source(fs.createReadStream(wallpaper)),
			mfs.write(id, {
				name,
				created,
			})
		);

		Promise
			.join(id, write)
			.spread(mfs.stat)
			.tap(file => t.deepEqual(file, {
				id: id,
				meta: {
					name,
					created,
				},
			}));
	});

	t.test('Not found', function( t ){
		t.plan(1);

		mfs.stat(ObjectId()).tap(stat => t.equal(stat, null));
	});
});

test('Exists', function( t ){
	var id = ObjectId();

	var write = pull(
		nodeToPull.source(fs.createReadStream(wallpaper)),
		mfs.write(id)
	);

	t.test(function( t ){
		t.plan(1);

		Promise
			.join(id, write)
			.spread(mfs.exists)
			.tap(exists => t.equal(exists, true));
	});

	t.test('Not found', function( t ){
		t.plan(1);

		mfs.exists(ObjectId()).tap(exists => t.equal(exists, false));
	});
});

test('Using UUIDs', function( t ){
	var id = uuid();

	var write = pull(
		nodeToPull.source(fs.createReadStream(wallpaper)),
		mfs.write(id)
	);

	t.test('Write', function( t ){
		t.plan(1);

		write.then(err => t.notOk(err));
	});

	t.test('Read', function( t ){
		t.plan(1);

		Promise
			.join(id, write)
			.spread(mfs.read)
			.then(chunks => pullToPromise(chunks, true))
			.then(Buffer.concat)
			.tap(downloaded => t.ok(downloaded.equals(wallpaperAsBuffer)));
	});

	t.test('Stat', function( t ){
		t.plan(1);

		Promise
			.join(id, write)
			.spread(mfs.stat)
			.tap(file => t.deepEqual(file, {
				id: file.id,
				meta: {},
			}));
	});

	t.test('Exists', function( t ){
		t.plan(2);

		Promise
			.join(id, write)
			.spread(mfs.exists)
			.tap(exists => t.equal(exists, true));

		mfs.exists(uuid())
			.tap(exists => t.equal(exists, false));
	});
});

function DummyError(){}

DummyError.prototype = Object.create(Error.prototype);
