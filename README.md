PolyMongo 🧩
Adaptive Multi-Database Wrapper for Mongoose

PolyMongo allows seamless multi-database usage with Mongoose. It automatically manages connections, caches frequently used databases, evicts idle ones based on priority/activity, and allows dynamic database selection — all while keeping the standard Mongoose API.

Features

Transparent multi-database support

.db("name") chaining for dynamic database selection

Fully supports all Mongoose/MongoDB commands (find, lean, aggregate, updateMany, watch, etc.)

Adaptive connection management based on usage, priority, and activity

Watch streams (.watch()) and priority -1 connections are protected but counted towards max connections

Connection metadata stored in a dedicated MongoDB database (default: polymongo-metadata)

Inspect connection stats with wrapper.stats()

Dynamically adjust database priority via wrapper.setPriority(dbName, priority)

Basic Usage (Copy-Paste)
import mongoose from "mongoose";
import PolyMongo from "polymongo";

// Create wrapper (only mongoURI required, other options use defaults)
const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017", // only host + port, DB portion is ignored
});

// Define and wrap models
const userSchema = new mongoose.Schema({ name: String, email: String });
const User = wrapper.wrapModel(mongoose.model("User", userSchema));

const orderSchema = new mongoose.Schema({ product: String, quantity: Number });
const Order = wrapper.wrapModel(mongoose.model("Order", orderSchema));

// Queries
await User.find();                 // Uses defaultDB (Default-DB)
await User.db("asia").find();      // Switch DB dynamically
await Order.db("us-central").create({ product: "Laptop", quantity: 1 });

// Watch stream prevents connection from being closed
const changeStream = User.db("test").watch();

// Inspect stats
console.log(wrapper.stats());

// Set priority dynamically (-1 = never close, 0 = highest, larger = lower)
await wrapper.setPriority("central", 0);
await wrapper.setPriority("analytics", 1000);

Full Config Usage with Defaults
const wrapper = PolyMongo.createWrapper({
  mongoURI: "mongodb://localhost:27017", // only host + port, DB portion ignored
  metadataDB: "polymongo-metadata",      // stores usage stats, priorities, scores
  maxConnections: undefined,              // default: unlimited
  defaultDB: "Default-DB",                // DB used if .db() not called
  idleTimeout: 60000,                     // for timeout-based eviction
  cacheConnections: true,                 // reuse existing connections
  disconnectOnIdle: true,                 // disconnect idle DBs (except watch/-1)
  evictionType: "LRU",                    // "manual" | "timeout" | "LRU"
});


Eviction Behavior:

manual → connections closed manually via wrapper.closeConnection('db')

timeout → idle connections disconnected after idleTimeout unless priority=-1 or watch active

LRU → connections evicted based on adaptive scoring

Max Connections Rule:

Default: unlimited

If maxConnections is set:

Active .watch() connections temporarily exceed limit for the new connection only

If creating additional connections exceeds the limit beyond temporary allowance, least-priority/non-watch connections are evicted

Priority -1 connections are only evicted if necessary and not actively watched

Inner Engineering

Metadata Storage:

Tracks lastUsed, useCount, idleTime, priority, and watch status in metadataDB

Adaptive Scoring (LRU):

score = useCount / avgInterval - idleTime / 1000 + priorityWeight


Connections with low scores are evicted first (unless watch active or priority=-1)

Priority System:

-1 → never closed (except manual eviction or necessary to respect maxConnections)

0 → highest priority

Larger numbers → lower priority; millions = lowest

Query Execution: .db() is only a chainable selector.

All standard Mongoose queries (lean, aggregate, findOneAndUpdate, etc.) are fully supported

Watch Streams: Active .watch() streams prevent connection eviction automatically

DefaultDB: If .db() is not called, the query uses defaultDB (default: "Default-DB")

FAQs

Q: What happens if .db() is not called?
A: The wrapper uses defaultDB.

Q: Does .db() change the Mongoose API?
A: No, it only selects the database. All Mongoose commands remain fully functional.

Q: Can I dynamically change database priority?
A: Yes, using await wrapper.setPriority("DbName", priority). Priority affects eviction scoring.

Q: How does the wrapper handle max connections with watch/priority=-1?
A:

Active .watch() connections and priority -1 are counted toward maxConnections

New connections can temporarily exceed the limit for watches

Beyond that, least-priority/non-watch connections are evicted to respect the limit

Q: How do I manually open/close connections?

await wrapper.closeConnection("testDB");
await wrapper.openConnection("testDB");


Q: How do I inspect active connections and stats?

console.log(wrapper.stats());


Shows hits, active DBs, idle times, usage frequency, watch, and priority info.