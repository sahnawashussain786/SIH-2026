import mongoose from 'mongoose';

const fieldConfidenceSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    confidence: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);  const aiMetaSchema = new mongoose.Schema(
  {
    engine: { type: String, default: 'unknown' },
    gemini: { type: String, default: '' },
    language: { type: String, default: 'unknown' },
    languages: [{ type: String }],
    documentType: { type: String, default: 'unknown' },
    preprocessed: { type: Boolean, default: false },
    pageTexts: [{ type: String }],
    pipeline: [{ type: String }],
    warnings: [{ type: String }],
    processingMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    originalName: { type: String, required: true },
    storedName: { type: String, default: '' },
    filePath: { type: String, default: '' },
    fileUrl: { type: String, default: '' },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    documentType: { type: String, default: 'Khatian' },
    language: { type: String, default: 'auto' },
    district: { type: String, default: '' },
    state: { type: String, default: '' },

    status: {
      type: String,
      enum: ['uploaded', 'processing', 'processed', 'failed', 'verified', 'rejected'],
      default: 'uploaded',
      index: true,
    },
    stage: { type: String, default: 'uploaded' },

    extracted: {
      ownerName: { type: String, default: '' },
      fatherName: { type: String, default: '' },
      khatianNumber: { type: String, default: '' },
      plotNumber: { type: String, default: '' },
      area: { type: String, default: '' },
      areaUnit: { type: String, default: '' },
      village: { type: String, default: '' },
      tehsil: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: '' },
      landType: { type: String, default: '' },
      surveyNumber: { type: String, default: '' },
      mutationDetails: { type: String, default: '' },
    },

    fieldConfidences: [fieldConfidenceSchema],
    overallConfidence: { type: Number, default: 0, index: true },
    validation: {
      errors: [{ type: String }],
      warnings: [{ type: String }],
      duplicates: [
        {
          recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandRecord' },
          documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
          reason: { type: String, default: '' },
          score: { type: Number, default: 0 },
        },
      ],
    },

    aiMeta: aiMetaSchema,
    ocrText: { type: String, default: '' },

    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewNote: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },

    recordId: { type: mongoose.Schema.Types.ObjectId, ref: 'LandRecord', default: null },
  },
  { timestamps: true }
);

documentSchema.index({ createdAt: -1 });

export default mongoose.model('Document', documentSchema);
