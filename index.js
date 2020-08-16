'use strict';

const Promise = require('bluebird');
const toPull = require('stream-to-pull-stream');

module.exports = fs;

function fs( mongodb, db, options ){
	const bucket = Promise.resolve(db).then(
		db => new mongodb.GridFSBucket(db, options)
	);

	return {
		write: write,
		read: read,
		stat: stat,
		exists: exists,
	};

	function write( id, meta ){
		if (meta === undefined)
			meta = {};

		return function( read ){
			return bucket.then(function( bucket ){
				const stream = bucket.openUploadStreamWithId(id, meta.name, {
					metadata: meta,
					contentType: meta.type,
				});

				/*
				A terrible hack with unknown consequences due to
				https://jira.mongodb.org/browse/NODE-2355
				*/
				stream.destroy = function(err, cb) {
					if (typeof cb === 'function') {
						cb(err);
					}
					return this;
				}

				return new Promise(function( rs, rj ){
					toPull.sink(stream,
						err => err ? rj(err) : rs()
					)(read);
				});
			});
		}
	}

	function read( id ){
		let stream;

		return function drain( end, cb ){
			if (stream !== undefined)
				return stream.then(stream => stream(end, cb));

			if (end !== null)
				return cb && cb(end);

			stream = bucket.then(
				bucket => toPull.source(bucket.openDownloadStream(id))
			);

			return drain(null, cb);
		}
	}

	function stat( id ){
		return bucket.then(bucket => bucket.find({
			_id: id,
		}, {
			limit: 1,
		}).next()).then(file => file === null ? null : {
			id: file._id,
			meta: file.metadata,
		});
	}

	function exists( id ){
		return stat(id).then(stat => stat !== null);
	}
}
