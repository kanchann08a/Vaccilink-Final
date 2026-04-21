require("dotenv").config();
const mongoose = require('mongoose');

const mongoURI = process.env.MONGO_URI;

const ParentSchema = new mongoose.Schema({
    gender: { type: String, default: "Unknown" }
}, { strict: false });

const Parent = mongoose.model('Parent', ParentSchema);

async function migrate() {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to MongoDB");

        const result = await Parent.updateMany(
            { $or: [{ gender: "Any" }, { gender: { $exists: false } }, { gender: "" }] },
            { $set: { gender: "Unknown" } }
        );

        console.log(`Migration complete. Updated ${result.modifiedCount} records.`);
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
