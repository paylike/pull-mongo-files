'use strict'

var fs = require('fs')
var Promise = require('bluebird')
var test = require('tape')
var mongodb = require('mongodb')
var nodeToPull = require('stream-to-pull-stream')
var {pull, values, collect} = require('pull-stream')
var pullToPromise = require('pull-to-promise')
var muuid = require('mongo-uuid')

const uuid = (i) => muuid(mongodb.Binary, i)

pullToPromise.Promise = Promise

var client = mongodb.connect(
	'mongodb://localhost:' +
		process.env.MONGODB_PORT +
		'/pull_mongo_files_test',
	{
		promiseLibrary: Promise,
		useNewUrlParser: true,
		useUnifiedTopology: true,
	}
)
var db = client.then((c) => c.db())

var mfs = require('./')(mongodb, db)

var ObjectId = mongodb.ObjectId

var nonceChunks = ['47', '61', '72', '66', '69', '65', '6c', '64'].map((nc) =>
	Buffer.from(nc, 'hex')
)

var nonce = Buffer.concat(nonceChunks)

test.onFinish(function () {
	db.call('dropDatabase').return(client).call('close')
})

test('Write', function (t) {
	t.test(function (t) {
		t.plan(2)

		var id = ObjectId()

		var write = pull(values(nonceChunks), mfs.write(id)).then((err) =>
			t.notOk(err)
		)

		Promise.join(id, write)
			.spread(mfs.read)
			.tap((file) => t.ok(file))
	})

	// Currently emits a warning from the "stream-to-pull-stream" module
	// because the MongoDB GridFS write stream does not implement a "destroy"
	// method.
	//
	// https://github.com/pull-stream/stream-to-pull-stream/blob/master/index.js#L21-L25
	// https://github.com/mongodb/node-mongodb-native/pull/1339

	t.test('Aborting', function (t) {
		t.plan(2)

		var id = ObjectId()

		var count = 0

		var write = pull(function (end, cb) {
			if (end !== null) return cb(end)

			if (count++ < 5) return cb(null, Buffer.from('00', 'hex')) // write a byte

			cb(new DummyError())
		}, mfs.write(id)).catch((err) => t.ok(err))

		Promise.join(id, write)
			.spread(mfs.read)
			.then(pullToPromise)
			.catch((err) => t.ok(err.message.includes('FileNotFound')))
	})

	t.test('With meta data', function (t) {
		t.plan(2)

		var id = ObjectId()

		var write = pull(
			values(nonceChunks),
			mfs.write(id, {
				name: 'wallpaper.jpg',
				created: new Date(),
			})
		).then((err) => t.notOk(err))

		Promise.join(id, write)
			.spread(mfs.read)
			.tap((file) => t.ok(file))
	})
})

test('Read', function (t) {
	var id = ObjectId()

	var write = pull(values(nonceChunks), mfs.write(id))

	t.test(function (t) {
		t.plan(1)

		write.then(() =>
			pull(
				mfs.read(id),
				collect((err, cs) =>
					err
						? console.error(err)
						: t.ok(Buffer.concat(cs).equals(nonce))
				)
			)
		)
	})

	t.test('Not found', function (t) {
		t.plan(1)

		pull(
			mfs.read(ObjectId()),
			collect((err) => t.ok(err.message.includes('FileNotFound')))
		)
	})
})

test('Stat', function (t) {
	var id = ObjectId()

	var write = pull(values(nonceChunks), mfs.write(id))

	t.test(function (t) {
		t.plan(1)

		Promise.join(id, write)
			.spread(mfs.stat)
			.tap((file) =>
				t.deepEqual(file, {
					id: id,
					meta: {},
				})
			)
	})

	t.test('With meta data', function (t) {
		t.plan(1)

		var id = ObjectId()

		var name = 'wallpaper.jpg'
		var created = new Date()

		var write = pull(
			values(nonceChunks),
			mfs.write(id, {
				name,
				created,
			})
		)

		Promise.join(id, write)
			.spread(mfs.stat)
			.tap((file) =>
				t.deepEqual(file, {
					id: id,
					meta: {
						name,
						created,
					},
				})
			)
	})

	t.test('Not found', function (t) {
		t.plan(1)

		mfs.stat(ObjectId()).tap((stat) => t.equal(stat, null))
	})
})

test('Exists', function (t) {
	var id = ObjectId()

	var write = pull(values(nonceChunks), mfs.write(id))

	t.test(function (t) {
		t.plan(1)

		Promise.join(id, write)
			.spread(mfs.exists)
			.tap((exists) => t.equal(exists, true))
	})

	t.test('Not found', function (t) {
		t.plan(1)

		mfs.exists(ObjectId()).tap((exists) => t.equal(exists, false))
	})
})

test('Using UUIDs', function (t) {
	var id = uuid()

	var write = pull(values(nonceChunks), mfs.write(id))

	t.test('Write', function (t) {
		t.plan(1)

		write.then((err) => t.notOk(err))
	})

	t.test('Read', function (t) {
		t.plan(1)

		write.then(() =>
			pull(
				mfs.read(id),
				collect((err, chunks) =>
					err
						? console.error(err)
						: t.ok(Buffer.concat(chunks).equals(nonce))
				)
			)
		)
	})

	t.test('Stat', function (t) {
		t.plan(1)

		Promise.join(id, write)
			.spread(mfs.stat)
			.tap((file) =>
				t.deepEqual(file, {
					id: file.id,
					meta: {},
				})
			)
	})

	t.test('Exists', function (t) {
		t.plan(2)

		Promise.join(id, write)
			.spread(mfs.exists)
			.tap((exists) => t.equal(exists, true))

		mfs.exists(uuid()).tap((exists) => t.equal(exists, false))
	})
})

function DummyError() {}

DummyError.prototype = Object.create(Error.prototype)
