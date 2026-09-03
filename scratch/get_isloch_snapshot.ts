import fs from "fs";
import path from "path";

const snapPath = path.join(process.cwd(), "data", "daily_snapshots", "2026-09-03.json");
const snap = JSON.parse(fs.readFileSync(snapPath, "utf-8"));
const isloch = snap.find((p: any) => p.match.toLowerCase().includes("isloch"));
console.log("ISLOCH OBJECT IN SNAPSHOT:", JSON.stringify(isloch, null, 2));
