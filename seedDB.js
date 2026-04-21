require("dotenv").config();
const mongoose = require("mongoose");
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/Vaccilink";

const parentSchema = new mongoose.Schema({
  parentName: String,
  email: String,
  phone: String,
  childName: String,
  childDOB: String,
  childID: String,
  vaccinationHistory: Array
}, { strict: false });

const Parent = mongoose.model("Parent", parentSchema);

async function seed() {
  await mongoose.connect(MONGO_URI);
  
  const records = [
    {
      parentName: "Alice Smith",
      email: "alice@example.com",
      phone: "1111111111",
      childName: "Baby Alice",
      childDOB: "2026-04-07", // 5 days old - Birth window
      childID: "C10001",
      vaccinationHistory: []
    },
    {
      parentName: "Bob Jones",
      email: "bob@example.com",
      phone: "2222222222",
      childName: "Baby Bob",
      childDOB: "2026-02-26", // 45 days old - 6 weeks window
      childID: "C10002",
      vaccinationHistory: []
    },
    {
      parentName: "Charlie Brown",
      email: "charlie@example.com",
      phone: "3333333333",
      childName: "Baby Charlie",
      childDOB: "2026-01-27", // 75 days old - 10 weeks window
      childID: "C10003",
      vaccinationHistory: []
    },
    {
      parentName: "Diana Prince",
      email: "diana@example.com",
      phone: "4444444444",
      childName: "Baby Diana",
      childDOB: "2025-12-28", // 105 days old - 14 weeks window
      childID: "C10004",
      vaccinationHistory: []
    },
    {
      parentName: "Eve Adams",
      email: "eve@example.com",
      phone: "5555555555",
      childName: "Baby Eve",
      childDOB: "2025-07-01", // 285 days old - 9 months window
      childID: "C10005",
      vaccinationHistory: []
    }
  ];

  for(const record of records) {
    // Upsert to not add redundant records on reruns
    await Parent.updateOne({ childID: record.childID }, { $set: record }, { upsert: true });
  }

  console.log("Seeded database with 5 children spanning different age groups.");
  await mongoose.disconnect();
}

seed().catch(console.error);
