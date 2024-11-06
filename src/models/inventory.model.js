const mongoose = require('mongoose');

const productRequestSchema = new mongoose.Schema({
  requestBy: { type: String, required: true },
  requestedOn: { type: Date, default: Date.now },
});

const stockHistorySchema = new mongoose.Schema({
  change: { type: Number, required: true },
  updatedBy: { type: String, required: true },
  reason: { type: String, required: true },
  date: { type: Date, default: Date.now },
});

const stockNeedToReceivedSchema = new mongoose.Schema({
  quantity: { type: Number, required: true },
  dueDate: { type: Date, required: true },
});

const inventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  category: { type: String, required: true },
  material: { type: String },
  weight: { type: Number },
  images: [{ type: String }],
  sku: { type: String, required: true, unique: true },
  status: { type: Boolean, default: true },
  stockHistory: [stockHistorySchema],
  stockNeedToReceived: stockNeedToReceivedSchema,
  productRequests: [productRequestSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Inventory', inventorySchema);
