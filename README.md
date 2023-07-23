# pull-mongo-files

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
const {GridFSBucket, MongoClient} = require('mongodb')
const client = new MongoClient('mongodb://localhost:27017/myproject')
const files = require('pull-mongo-files')(GridFSBucket, client.db())
```

## Examples

### Write

```js
const fs = require('node:fs')
const pull = require('pull-stream')
const toPull = require('stream-to-pull-stream')

pull(
	toPull.source(fs.createReadStream('my_image.jpg'), {
		name: 'image.jpg',
		type:
	}),
	files.write(new ObjectId())
)
```

### Read

```js
const pull = require('pull-stream')
const toPull = require('stream-to-pull-stream')

pull(files.read(id), toPull.sink(res))
```

### Meta data

Use `write` to write any meta data and `stat` to read it.

If you provide the keys `name` and `type` they are duplicated onto the file
document's root level as `filename` and `contentType` as those have special
status in other MongoDb GridFS implementations.

### Using UUIDs

```js
const uuid = require('mongo-uuid')

files.write(uuid())
```
