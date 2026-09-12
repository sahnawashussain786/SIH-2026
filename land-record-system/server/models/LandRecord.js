import mongoose from 'mongoose';

const landRecordSchema = new mongoose.Schema(
  {
    ownerName: { type: String, required: true, index: true },
    khatianNumber: { type: String, default: '', index: true },
    plotNumber: { type: String, default: '', index: true },
    surveyNumber: { type: String, default: '' },
    area: { type: String, default: '' },
    areaValue: { type: Number, default: null },
    areaUnit: { type: String, default: '' },
    village: { type: String, default: '', index: true },
    tehsil: { type: String, default: '' },
    district: { type: String, default: '', index: true },
    state: { type: String, default: '', index: true },
    landType: { type: String, default: '' },
    mutationDetails: { type: String, default: '' },

    sourceDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAutomatically: { type: Boolean, default: false },
    confidence: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: Date.now },
    gis: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

landRecordSchema.index(
  { khatianNumber: 1, plotNumber: 1, village: 1, district: 1 },
  { name: 'uniq_land_parcel_idx' }
);

export default mongoose.model('LandRecord', landRecordSchema);
