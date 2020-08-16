# pull-mongo-files

Warning: this version includes a hack (see the source) to work around [an
issue in the mongodb client](https://jira.mongodb.org/browse/NODE-2355)
apparent when using Node.js v13+.

Read and write files from MongoDb's GridFS using
[pull-streams](https://github.com/pull-stream/pull-stream).

```js
files.write(id[, meta]) -> SinkStream() -> Promise()
files.read(id) -> SourceStream()
files.stat(id) -> Promise({ id, meta })
files.exists(id) -> Promise(Boolean)
```


## Setup

```sh
npm install pull-mongo-files
```

```js
var mongodb = require('mongodb');

var db = mongodb.connect('mongodb://localhost/test');

var files = require('pull-mongo-files')(mongodb, db);
```

## Examples

### Write

```js
var fs = require('fs');
var pull = require('pull-stream');
var toPull = require('stream-to-pull-stream');

pull(
	toPull.source(fs.createReadStream('my_image.jpg'), {
		name: 'image.jpg',
		type:
	}),
	files.write(mongodb.ObjectId())
)
```


### Read

```js
var pull = require('pull-stream');
var toPull = require('stream-to-pull-stream');

pull(
	files.read(id),
	toPull.sink(res)
);
```

### Meta data

Use `write` to write any meta data and `stat` to read it.

If you provide the keys `name` and `type` they are duplicated onto the file
document's root level as `filename` and `contentType` as those have special
status in other MongoDb GridFS implementations.


### Using UUIDs

```js
var uuid = require('mongo-uuid');

files.write(uuid());
```
