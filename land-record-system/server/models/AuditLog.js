import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'system' },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: '' },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

auditLogSchema.statics.log = function log({ actor = null, actorName = 'system', action, entityType = '', entityId = null, details = {}, ip = '' }) {
  return this.create({ actor, actorName, action, entityType, entityId, details, ip });
};

export default mongoose.model('AuditLog', auditLogSchema);
