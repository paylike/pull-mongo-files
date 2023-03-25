'use strict'

const toPull = require('stream-to-pull-stream')

module.exports = fs

function fs(GridFSBucket, db, options) {
	const bucket = new GridFSBucket(db, options)
	return {write, read, stat, exists}

	function write(id, meta = {}) {
		return (read) => {
			const stream = bucket.openUploadStreamWithId(id, meta.name, {
				metadata: meta,
				contentType: meta.type,
			})
			return new Promise((rs, rj) =>
				toPull.sink(stream, (err) => (err ? rj(err) : rs()))(read)
			)
		}
	}

	function read(id) {
		return toPull.source(bucket.openDownloadStream(id))
	}

	function stat(id) {
		return bucket
			.find({_id: id})
			.limit(1)
			.next()
			.then((file) =>
				file === null
					? null
					: {
							id: file._id,
							meta: file.metadata,
					  }
			)
	}

	function exists(id) {
		return stat(id).then((stat) => stat !== null)
	}
}
