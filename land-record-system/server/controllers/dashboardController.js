import Document from '../models/Document.js';
import LandRecord from '../models/LandRecord.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';

/** GET /api/dashboard/stats — headline metrics for the government dashboard */
export async function getStats(_req, res, next) {
  try {
    const [totalDocs, processed, pending, verified, rejected, failed, records, users] = await Promise.all([
      Document.countDocuments({}),
      Document.countDocuments({ status: { $in: ['processed', 'verified'] } }),
      Document.countDocuments({ status: 'processed', stage: { $in: ['manual_review', 'mandatory_verification'] } }),
      Document.countDocuments({ status: 'verified' }),
      Document.countDocuments({ status: 'rejected' }),
      Document.countDocuments({ status: 'failed' }),
      LandRecord.countDocuments({}),
      User.countDocuments({ isActive: true }),
    ]);

    const avgConfidenceAgg = await Document.aggregate([
      { $match: { status: { $in: ['processed', 'verified'] } } },
      { $group: { _id: null, avg: { $avg: '$overallConfidence' } } },
    ]);

    // Validation errors across documents
    const validationIssues = await Document.countDocuments({ 'validation.errors.0': { $exists: true } });

    // State-wise progress (share of verified docs by extracted state)
    const stateProgress = await Document.aggregate([
      { $match: { 'extracted.state': { $ne: '' } } },
      { $group: { _id: '$extracted.state', total: { $sum: 1 }, verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } } } },
      { $project: { _id: 0, state: '$_id', total: 1, verified: 1, pct: { $round: [{ $multiply: [{ $divide: ['$verified', '$total'] }, 100] }, 0] } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]);

    // Confidence distribution buckets
    const confidenceBuckets = await Document.aggregate([
      { $match: { status: { $in: ['processed', 'verified'] } } },
      {
        $bucket: {
          groupBy: '$overallConfidence',
          boundaries: [0, 70, 85, 90, 96, 101],
          default: 'unknown',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    // Last 14 days upload trend
    const since = new Date(Date.now() - 13 * 24 * 3600 * 1000);
    since.setHours(0, 0, 0, 0);
    const trend = await Document.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      totals: {
        documents: totalDocs,
        processed,
        pending,
        verified,
        rejected,
        failed,
        records,
        users,
        validationIssues,
      },
      avgConfidence: Math.round(avgConfidenceAgg[0]?.avg || 0),
      stateProgress,
      confidenceBuckets,
      trend,
    });
  } catch (err) {
    next(err);
  }
}
