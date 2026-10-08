/**
 * Bootstrap the very first Super Admin account.
 *
 * Usage:
 *   npm run create-admin -- "Full Name" admin@example.com "StrongPassword123"
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User";

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: npm run create-admin -- "Full Name" you@example.com "StrongPassword123"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set — copy .env.example to .env.local first.");
  await mongoose.connect(uri);

  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) {
    console.error(`A user with email ${email} already exists.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await User.create({ name, email, role: "admin", passwordHash });
  console.log(`Super Admin created: ${admin.name} <${admin.email}>`);
  console.log("Sign in at /login with the password you provided.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
