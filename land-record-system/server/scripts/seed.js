/**
 * Seed script — creates demo users of every role, documents and approved
 * land records so the dashboard has data immediately.
 * Run: npm run seed
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Document from '../models/Document.js';
import LandRecord from '../models/LandRecord.js';
import AuditLog from '../models/AuditLog.js';
import { demoUsers, demoDocs } from './seedData.js';

async function createDemoData() {
  const users = demoUsers();
  const docs = demoDocs();

  console.log('[seed] creating users…');
  const created = {};
  for (const u of users) {
    created[u.role] = await User.create(u);
    console.log(`  ✓ ${u.role.padEnd(22)} ${u.email}`);
  }

  console.log('[seed] creating documents & records…');
  for (const d of docs) {
    const uploader = d.status === 'failed' ? created.digitization_operator : created.data_entry_officer;
    const doc = await Document.create({ ...d, uploadedBy: uploader._id });
    if (d.status === 'verified') {
      const record = await LandRecord.create({
        ...d.extracted,
        areaValue: parseFloat(d.extracted.area) || null,
        sourceDocument: doc._id,
        approvedBy: created.revenue_officer._id,
        approvedAutomatically: false,
        confidence: d.overallConfidence,
      });
      doc.recordId = record._id;
      doc.reviewedBy = created.revenue_officer._id;
      doc.reviewedAt = new Date();
      await doc.save();
    }
    if (d.stage === 'auto_accept') {
      const record = await LandRecord.create({
        ...d.extracted,
        areaValue: parseFloat(d.extracted.area) || null,
        sourceDocument: doc._id,
        approvedAutomatically: true,
        confidence: d.overallConfidence,
      });
      doc.recordId = record._id;
      await doc.save();
    }
    console.log(`  ✓ ${d.title}`);
  }

  await AuditLog.log({ actorName: 'seed', action: 'system.seed', details: { users: users.length, documents: docs.length } });
  return users;
}

export async function seedDatabase() {
  await connectDB();
  console.log('[seed] clearing existing data…');
  await Promise.all([User.deleteMany({}), Document.deleteMany({}), LandRecord.deleteMany({}), AuditLog.deleteMany({})]);
  const users = await createDemoData();
  return users;
}

// CLI entry (not used when imported by server auto-seed)
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then((users) => {
      console.log('\n[seed] Done! Demo accounts:');
      console.table(users.map((u) => ({ email: u.email, password: u.password, role: u.role })));
      return mongoose.disconnect();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
