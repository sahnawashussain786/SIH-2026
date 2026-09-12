/**
 * Demo data factory — shared by `npm run seed` (CLI) and the server's
 * in-memory demo mode (auto-seed when no MongoDB is configured).
 */
export function demoUsers() {
  return [
    { name: 'Admin User', email: 'admin@lrs.gov.in', password: 'Admin@123', role: 'admin', district: 'Burdwan', state: 'West Bengal' },
    { name: 'Priya Sharma', email: 'officer@lrs.gov.in', password: 'Officer@123', role: 'data_entry_officer', district: 'Burdwan', state: 'West Bengal' },
    { name: 'Rahul Verma', email: 'reviewer@lrs.gov.in', password: 'Reviewer@123', role: 'revenue_officer', district: 'Burdwan', state: 'West Bengal' },
    { name: 'Anita Desai', email: 'senior@lrs.gov.in', password: 'Senior@123', role: 'senior_officer', district: 'Burdwan', state: 'West Bengal' },
    { name: 'Vikram Singh', email: 'operator@lrs.gov.in', password: 'Operator@123', role: 'digitization_operator', district: 'Muzaffarpur', state: 'Bihar' },
    { name: 'Citizen User', email: 'citizen@lrs.gov.in', password: 'Citizen@123', role: 'citizen' },
  ];
}

export function demoDocs() {
  return [
    {
      title: 'Khatian 1245 — Rampur (Abdul Rahman)',
      originalName: 'khatian_1245_rampur.jpg',
      documentType: 'Khatian', language: 'auto', district: 'Burdwan', state: 'West Bengal',
      status: 'verified', stage: 'approved', overallConfidence: 94,
      extracted: { ownerName: 'Abdul Rahman', khatianNumber: '1245', plotNumber: '782', area: '2.50', areaUnit: 'acre', village: 'Rampur', tehsil: 'Raninagar', district: 'Burdwan', state: 'West Bengal', landType: 'Agricultural', mutationDetails: 'Case No. 1145/2024 dated 12.03.2024' },
      fieldConfidences: [
        { field: 'ownerName', value: 'Abdul Rahman', confidence: 98 },
        { field: 'khatianNumber', value: '1245', confidence: 99 },
        { field: 'plotNumber', value: '782', confidence: 96 },
        { field: 'area', value: '2.50', confidence: 91 },
        { field: 'village', value: 'Rampur', confidence: 87 },
      ],
      validation: { errors: [], warnings: [] },
      ocrText: 'Name of Tenant: Abdul Rahman\nKhatian No: 1245\nPlot No: 782\nArea: 2.50 Acre\nVillage: Rampur\nDistrict: Burdwan',
    },
    {
      title: 'Khatian 0871 — Bishnupur (Sita Devi)',
      originalName: 'khatian_0871_bishnupur.jpg',
      documentType: 'Khatian', language: 'auto', district: 'Nadia', state: 'West Bengal',
      status: 'processed', stage: 'manual_review', overallConfidence: 82,
      extracted: { ownerName: 'Sita Devi', khatianNumber: '0871', plotNumber: '312', area: '1.20', areaUnit: 'acre', village: 'Bishnupur', tehsil: 'Krishnanagar', district: 'Nadia', state: 'West Bengal', landType: 'Agricultural' },
      fieldConfidences: [
        { field: 'ownerName', value: 'Sita Devi', confidence: 90 },
        { field: 'khatianNumber', value: '0871', confidence: 95 },
        { field: 'plotNumber', value: '312', confidence: 78 },
        { field: 'area', value: '1.20', confidence: 72 },
        { field: 'village', value: 'Bishnupur', confidence: 74 },
      ],
      validation: { errors: [], warnings: [] },
    },
    {
      title: 'Khasra 4421 — Devgaon (handwritten, low confidence)',
      originalName: 'khasra_4421_devgaon.png',
      documentType: 'Khasra', language: 'hi', district: 'Sitapur', state: 'Uttar Pradesh',
      status: 'processed', stage: 'mandatory_verification', overallConfidence: 58,
      extracted: { ownerName: 'R', khatianNumber: '', plotNumber: '4421', area: '', areaUnit: '', village: 'Devgaon', tehsil: 'Maholi', district: 'Sitapur', state: 'Uttar Pradesh', landType: '' },
      fieldConfidences: [
        { field: 'ownerName', value: 'R', confidence: 35 },
        { field: 'plotNumber', value: '4421', confidence: 71 },
        { field: 'village', value: 'Devgaon', confidence: 68 },
      ],
      validation: { errors: ['Missing required field: ownerName', 'Missing required field: khatianNumber', 'Missing required field: area'], warnings: [] },
    },
    {
      title: 'Patta 556 — Sujatganj (Ramesh Chandra Gupta)',
      originalName: 'patta_556_sujatganj.pdf',
      documentType: 'Patta', language: 'auto', district: 'Muzaffarpur', state: 'Bihar',
      status: 'processed', stage: 'auto_accept', overallConfidence: 96,
      extracted: { ownerName: 'Ramesh Chandra Gupta', khatianNumber: '556', plotNumber: '1902', area: '3.75', areaUnit: 'acre', village: 'Sujatganj', tehsil: 'Katrah', district: 'Muzaffarpur', state: 'Bihar', landType: 'Residential', mutationDetails: 'Case No. 2210/2023' },
      fieldConfidences: [
        { field: 'ownerName', value: 'Ramesh Chandra Gupta', confidence: 97 },
        { field: 'khatianNumber', value: '556', confidence: 98 },
        { field: 'plotNumber', value: '1902', confidence: 95 },
        { field: 'area', value: '3.75', confidence: 94 },
        { field: 'village', value: 'Sujatganj', confidence: 92 },
      ],
      validation: { errors: [], warnings: [] },
    },
    {
      title: 'Khatian 2210 — Kishanganj (OCR failed demo)',
      originalName: 'khatian_2210_kishanganj.jpg',
      documentType: 'Khatian', language: 'auto', district: 'Kishanganj', state: 'Bihar',
      status: 'failed', stage: 'ai_failed', overallConfidence: 0,
      extracted: {},
      fieldConfidences: [],
      validation: { errors: [], warnings: [] },
      aiMeta: { engine: 'python-ai', warnings: ['OCR failed: image too degraded (demo entry)'] },
    },
  ];
}
