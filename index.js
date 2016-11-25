'use strict';

var Promise = require('bluebird');
var nodeToPull = require('stream-to-pull-stream');

module.exports = fs;

function fs( mongodb, db, options ){
	var bucket = Promise.resolve(db).then(function( db ){
		return new mongodb.GridFSBucket(db, options);
	});

	return {
		write: write,
		read: read,
		stat: stat,
		exists: exists,
	};

	function write( id, meta ){
		meta = meta || {};

		return function( read ){
			var file = bucket
				.call('openUploadStreamWithId', id, meta.name, {
					metadata: meta,
					contentType: meta.type,
				});

			return Promise.fromCallback(function( cb ){
				Promise
					.join(file, cb, nodeToPull.sink)
					.then(function( sink ){
						sink(read);
					});
			});
		}
	}

	function read( id ){
		var stream;

		return function drain( end, cb ){
			if (stream)
				return stream.then(function( stream ){
					return stream(end, cb);
				});

			if (end)
				return cb && cb(end);

			stream = bucket
				.call('openDownloadStream', id)
				.then(nodeToPull.source);

			return drain(null, cb);
		}
	}

	function stat( id ){
		return bucket
			.call('find', {
				_id: id,
			}, {
				limit: 1,
			})
			.call('next')
			.then(function( file ){
				if (!file)
					return null;

				return {
					id: file._id,
					meta: file.metadata,
				};
			});
	}

	function exists( id ){
		return stat(id)
			.then(function( stat ){
				return stat !== null;
			});
	}
}
