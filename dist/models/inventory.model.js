const mongoose = require('mongoose');
const productRequestSchema = new mongoose.Schema({
  requestBy: {
    type: String,
    required: true
  },
  requestedOn: {
    type: Date,
    default: Date.now
  }
});
const stockHistorySchema = new mongoose.Schema({
  change: {
    type: Number,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});
const soldHistorySchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  orderid: {
    type: String,
    required: true
  },
  stockselled: {
    type: Number,
    required: true
  }
});
const stockNeedToReceivedSchema = new mongoose.Schema({
  quantity: {
    type: Number,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  }
});
const inventorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  stock: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  material: {
    type: String
  },
  weight: {
    type: Number
  },
  images: [{
    type: String
  }],
  sku: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: Boolean,
    default: true
  },
  stockHistory: [stockHistorySchema],
  stockNeedToReceived: stockNeedToReceivedSchema,
  soldHistory: [soldHistorySchema],
  productRequests: [productRequestSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lowerThan: {
    type: Number
  },
  higherThan: {
    type: Number
  },
  reorderPoint: {
    type: Number,
    default: 0
  },
  reorderQuantity: {
    type: Number,
    default: 0
  }
});
module.exports = mongoose.model('Inventory', inventorySchema);