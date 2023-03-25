'use strict'

const join = require('psjoin')
const drain = require('psp-drain')
const collect = require('psp-collect')
const test = require('tape')
const {GridFSBucket, MongoClient, ObjectId, Binary} = require('mongodb')
const {pull, values} = require('pull-stream')
const muuid = require('mongo-uuid')

const uuid = (i) => muuid(Binary, i)

const client = new MongoClient(
	'mongodb://localhost:' + process.env.MONGODB_PORT + '/pull_mongo_files_test'
)
const db = client.db()

const mfs = require('./')(GridFSBucket, db)

const nonceChunks = ['47', '61', '72', '66', '69', '65', '6c', '64'].map((nc) =>
	Buffer.from(nc, 'hex')
)

const nonce = Buffer.concat(nonceChunks)

test.onFinish(() => db.dropDatabase().then(() => client.close()))

test('Write', (t) => {
	t.test((t) => {
		t.plan(2)

		const id = new ObjectId()
		const write = pull(values(nonceChunks), mfs.write(id)).then((err) =>
			t.notOk(err)
		)
		join(id, write, mfs.read).then((file) => t.ok(file))
	})

	t.test('Aborting', (t) => {
		t.plan(2)

		const id = new ObjectId()
		let count = 0
		const write = pull((end, cb) => {
			if (end !== null) return cb(end)

			if (count++ < 5) return cb(null, Buffer.from('00', 'hex')) // write a byte

			cb(new DummyError())
		}, mfs.write(id)).catch((err) => t.ok(err))
		join(id, write, (id) => pull(mfs.read(id), drain())).catch((err) =>
			t.ok(err.message.includes('FileNotFound'))
		)
	})

	t.test('With meta data', (t) => {
		t.plan(2)

		const id = new ObjectId()
		const write = pull(
			values(nonceChunks),
			mfs.write(id, {
				name: 'wallpaper.jpg',
				created: new Date(),
			})
		).then((err) => t.notOk(err))
		join(id, write, mfs.read).then((file) => t.ok(file))
	})
})

test('Read', (t) => {
	const id = new ObjectId()
	const write = pull(values(nonceChunks), mfs.write(id))

	t.test((t) => {
		t.plan(1)

		write.then(() =>
			pull(mfs.read(id), collect()).then((cs) =>
				t.ok(Buffer.concat(cs).equals(nonce))
			)
		)
	})

	t.test('Not found', (t) => {
		t.plan(1)

		pull(mfs.read(new ObjectId()), collect()).catch((err) =>
			t.ok(err.message.includes('FileNotFound'))
		)
	})
})

test('Stat', (t) => {
	const id = new ObjectId()
	const write = pull(values(nonceChunks), mfs.write(id))

	t.test((t) => {
		t.plan(1)

		join(id, write, mfs.stat).then((file) =>
			t.deepEqual(file, {
				id: id,
				meta: {},
			})
		)
	})

	t.test('With meta data', (t) => {
		t.plan(1)

		const id = new ObjectId()
		const name = 'wallpaper.jpg'
		const created = new Date()
		const write = pull(
			values(nonceChunks),
			mfs.write(id, {
				name,
				created,
			})
		)
		join(id, write, mfs.stat).then((file) =>
			t.deepEqual(file, {
				id: id,
				meta: {
					name,
					created,
				},
			})
		)
	})

	t.test('Not found', (t) => {
		t.plan(1)

		mfs.stat(new ObjectId()).then((stat) => t.equal(stat, null))
	})
})

test('Exists', (t) => {
	const id = new ObjectId()
	const write = pull(values(nonceChunks), mfs.write(id))

	t.test((t) => {
		t.plan(1)

		join(id, write, mfs.exists).then((exists) => t.equal(exists, true))
	})

	t.test('Not found', (t) => {
		t.plan(1)

		mfs.exists(new ObjectId()).then((exists) => t.equal(exists, false))
	})
})

test('Using UUIDs', (t) => {
	const id = uuid()
	const write = pull(values(nonceChunks), mfs.write(id))

	t.test('Write', (t) => {
		t.plan(1)

		write.then((err) => t.notOk(err))
	})

	t.test('Read', (t) => {
		t.plan(1)

		write
			.then(() => pull(mfs.read(id), collect()))
			.then((chunks) => t.ok(Buffer.concat(chunks).equals(nonce)))
	})

	t.test('Stat', (t) => {
		t.plan(1)

		join(id, write, mfs.stat).then((file) =>
			t.deepEqual(file, {
				id: file.id,
				meta: {},
			})
		)
	})

	t.test('Exists', (t) => {
		t.plan(2)

		join(id, write, mfs.exists).then((exists) => t.equal(exists, true))

		mfs.exists(uuid()).then((exists) => t.equal(exists, false))
	})
})

function DummyError() {}

DummyError.prototype = Object.create(Error.prototype)
