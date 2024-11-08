/* eslint-disable radix */
// routes/inventory.js
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const router = express.Router();
const Inventory = require('../../models/inventory.model');

const LOW_STOCK_THRESHOLD = 10;
const HIGH_STOCK_THRESHOLD = 14;
const upload = multer({ dest: 'utils/' });
// const upload = multer({ storage: multer.memoryStorage() });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

router.put('/set-alert', async (req, res) => {
  const { sku, lowerThan, higherThan } = req.body;

  try {
    // Validate inputs
    if (!sku || (typeof lowerThan !== 'number' && typeof higherThan !== 'number')) {
      return res
        .status(400)
        .json({ message: "Please provide 'sku' and at least one of 'lowerThan' or 'higherThan' thresholds." });
    }

    // Find and update the alert thresholds
    const result = await Inventory.findOneAndUpdate({ sku }, { $set: { lowerThan, higherThan } }, { new: true });

    if (!result) {
      return res.status(404).json({ message: 'Inventory item not found with the specified SKU.' });
    }

    res.json({ message: 'Alert thresholds set successfully', updatedInventory: result });
  } catch (error) {
    console.error('Error setting alert thresholds:', error);
    res.status(500).json({ message: 'Server error while setting alert thresholds' });
  }
});

// Helper function to send an email alert
async function sendAlertEmail(subject, message) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL,
      subject,
      text: message,
    });
  } catch (error) {
    console.error('Error sending alert email:', error);
  }
}

// Modified /api/inventory/sell API to check alert thresholds
router.put('/api/inventory/sell', async (req, res) => {
  const { sku, date, orderid, stockselled } = req.body;

  try {
    // Validate inputs
    if (!sku || !orderid || typeof stockselled !== 'number') {
      return res.status(400).json({ message: "Please provide 'sku', 'orderid', and 'stockselled'." });
    }

    // Set the date to the current date if it's not provided
    const saleDate = date ? new Date(date) : new Date();

    // Find the inventory item by SKU and update the sold history and stock
    const result = await Inventory.findOneAndUpdate(
      { sku },
      {
        $push: { soldHistory: { date: saleDate, orderid, stockselled } },
        $inc: { stock: -stockselled },
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: 'Inventory item not found with the specified SKU.' });
    }

    // Check if the updated stock level triggers any alerts
    const { stock, lowerThan, higherThan } = result;
    if (lowerThan !== undefined && stock < lowerThan) {
      await sendAlertEmail(
        `Low Stock Alert for SKU: ${sku}`,
        `The stock for SKU ${sku} has fallen below the set threshold of ${lowerThan}. Current stock: ${stock}`
      );
    }

    if (higherThan !== undefined && stock > higherThan) {
      await sendAlertEmail(
        `High Stock Alert for SKU: ${sku}`,
        `The stock for SKU ${sku} has exceeded the set threshold of ${higherThan}. Current stock: ${stock}`
      );
    }

    res.json({ message: 'Stock sold history updated successfully', updatedInventory: result });
  } catch (error) {
    console.error('Error updating sold history:', error);
    res.status(500).json({ message: 'Server error while updating sold history' });
  }
});

router.put('/sku/:sku/change-status', async (req, res) => {
  const { status } = req.body;
  try {
    if (typeof status !== 'boolean') {
      return res.status(400).json({ message: "Please provide 'status' as true or false." });
    }
    const result = await Inventory.findOneAndUpdate({ sku: req.params.sku }, { $set: { status } }, { new: true });
    if (!result) {
      return res.status(404).json({ message: 'Inventory item not found with the specified SKU.' });
    }
    res.json({ message: 'Status updated successfully', updatedInventory: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error while updating status' });
  }
});

router.put('/sku/:sku/remove-request', async (req, res) => {
  const { requestId } = req.body;
  try {
    if (!requestId) {
      return res.status(400).json({ message: "Please provide 'requestId'." });
    }
    const result = await Inventory.findOneAndUpdate(
      { sku: req.params.sku },
      { $pull: { productRequests: { _id: requestId } } },
      { new: true }
    );
    if (!result) {
      return res.status(404).json({ message: 'Inventory item not found with the specified SKU.' });
    }
    res.json({ message: 'Request removed successfully', updatedInventory: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error while removing request' });
  }
});

router.put('/set-reorder', async (req, res) => {
  const { sku, reorderPoint, reorderQuantity } = req.body;

  try {
    // Validate inputs
    if (!sku || typeof reorderPoint !== 'number' || typeof reorderQuantity !== 'number') {
      return res.status(400).json({ message: "Please provide 'sku', 'reorderPoint', and 'reorderQuantity'." });
    }

    // Find and update the reorder details
    const result = await Inventory.findOneAndUpdate({ sku }, { $set: { reorderPoint, reorderQuantity } }, { new: true });

    if (!result) {
      return res.status(404).json({ message: 'Inventory item not found with the specified SKU.' });
    }

    res.json({ message: 'Reorder details set successfully', updatedInventory: result });
  } catch (error) {
    console.error('Error setting reorder details:', error);
    res.status(500).json({ message: 'Server error while setting reorder details' });
  }
});

// Create a new inventory item
router.post('/', async (req, res) => {
  try {
    const item = new Inventory(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post('/csv/update-stock', upload.single('file'), async (req, res) => {
  // Access the uploaded file from memory
  const fileBuffer = req.file.buffer; // Buffer containing the uploaded file
  const updates = [];

  // Parse the CSV data from the buffer
  fs.createReadStream(fileBuffer) // You might need to use a different method here
    .pipe(csv())
    .on('data', (row) => {
      updates.push({
        sku: row.SKU,
        quantity: parseInt(row.Quantity, 10),
      });
    })
    .on('end', async () => {
      const bulkOps = updates.map((item) => ({
        updateOne: {
          filter: { sku: item.sku },
          update: { $inc: { stock: item.quantity } },
        },
      }));

      try {
        await Inventory.bulkWrite(bulkOps);
        res.json({ message: 'Stock updated successfully' });
      } catch (error) {
        console.error('Error updating stock:', error);
        res.status(500).json({ message: 'Error updating stock' });
      }
    });
});

router.get('/download-sample-csv', (req, res) => {
  const filePath = path.join(__dirname, 'sample.csv');
  res.download(filePath, 'sample.csv', (err) => {
    if (err) {
      console.error('Error downloading sample file:', err);
      res.status(500).json({ message: 'Error downloading sample file' });
    }
  });
});

router.put('/deactivate', async (req, res) => {
  const { ids, skus } = req.body;

  try {
    // Check if either 'ids' or 'skus' array is provided
    if ((!ids || ids.length === 0) && (!skus || skus.length === 0)) {
      return res.status(400).json({ message: "Please provide either 'ids' or 'skus' to update records." });
    }

    // Build the update filter based on the provided parameters
    const updateFilter = {
      $or: [],
    };

    if (ids && ids.length > 0) {
      updateFilter.$or.push({ _id: { $in: ids.map((id) => mongoose.Types.ObjectId(id)) } });
    }

    if (skus && skus.length > 0) {
      updateFilter.$or.push({ sku: { $in: skus } });
    }

    // Perform the update operation to set status to false
    const result = await Inventory.updateMany(updateFilter, { $set: { status: false } });

    res.json({ message: 'Records updated successfully', modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Error updating records:', error);
    res.status(500).json({ message: 'Server error while updating records' });
  }
});

router.get('/price-summary', async (req, res) => {
  try {
    const inventoryPriceSummary = await Inventory.aggregate([
      {
        $group: {
          _id: '$category',
          stockTotal: { $sum: '$stock' },
          stockTotalPrice: { $sum: { $multiply: ['$stock', '$price'] } },
          StockToBeReceivedTotal: { $sum: '$stockNeedToReceived.quantity' },
          StockToBeReceivedTotalPrice: { $sum: { $multiply: ['$stockNeedToReceived.quantity', '$price'] } },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          stockTotal: 1,
          stockTotalPrice: 1,
          StockToBeReceivedTotal: 1,
          StockToBeReceivedTotalPrice: 1,
        },
      },
      {
        $group: {
          _id: null,
          categories: { $push: '$$ROOT' },
          overAllStockTotal: { $sum: '$stockTotal' },
          overAllStockTotalPrice: { $sum: '$stockTotalPrice' },
          overAllStockToBeReceivedTotal: { $sum: '$StockToBeReceivedTotal' },
          overAllStockToBeReceivedTotalPrice: { $sum: '$StockToBeReceivedTotalPrice' },
        },
      },
      {
        $project: {
          _id: 0,
          categories: 1,
          overAllStockTotal: 1,
          overAllStockTotalPrice: 1,
          overAllStockToBeReceivedTotal: 1,
          overAllStockToBeReceivedTotalPrice: 1,
        },
      },
    ]);

    res.json(inventoryPriceSummary[0]);
  } catch (error) {
    console.error('Error fetching inventory price summary:', error);
    res.status(500).json({ message: 'Server error while fetching inventory price summary' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const inventorySummary = await Inventory.aggregate([
      {
        $group: {
          _id: '$category',
          stockTotal: { $sum: '$stock' },
          StockToBeReceivedTotal: { $sum: '$stockNeedToReceived.quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          stockTotal: 1,
          StockToBeReceivedTotal: 1,
        },
      },
    ]);

    res.json(inventorySummary);
  } catch (error) {
    res.status(500).json({ message: 'Server error while fetching inventory summary' });
  }
});

router.get('/inventory-with-requests', async (req, res) => {
  try {
    const itemsWithRequests = await Inventory.find({ 'productRequests.0': { $exists: true } });

    if (!itemsWithRequests.length) {
      return res.status(404).json({ message: 'No inventory items with product requests found' });
    }

    res.json(itemsWithRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/stock-history', async (req, res) => {
  try {
    // Find all inventory items and select only necessary fields
    const allItems = await Inventory.find({}, 'name category status stockHistory images stock sku');

    // Aggregate all stock histories into a single array with additional fields
    const allStockHistory = [];
    allItems.forEach((item) => {
      item.stockHistory.forEach((history) => {
        allStockHistory.push({
          name: item.name,
          category: item.category,
          status: item.status,
          change: history.change,
          updatedBy: history.updatedBy,
          reason: history.reason,
          date: new Date(history.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), // Format date
          images: item.images,
          stock: item.stock,
          _id: history._id,
          sku: item.sku,
        });
      });
    });

    // Sort the aggregated stock history by date in ascending order
    const sortedStockHistory = allStockHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(sortedStockHistory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/stock-out', async (req, res) => {
  try {
    const stockOutItems = await Inventory.find({ stock: 0 }, 'name category status stock sku images');

    if (stockOutItems.length === 0) {
      return res.status(404).json({ message: 'No stock out products found' });
    }

    res.json(stockOutItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Read all inventory items
router.get('/', async (req, res) => {
  try {
    const { page, limit, category, status } = req.query;

    // Build the filter object
    const filter = {};
    if (category) {
      filter.category = category;
    }

    // Apply status filter if provided (convert to boolean)
    if (typeof status !== 'undefined') {
      filter.status = status === 'true';
    }

    // Handle pagination if provided
    if (page && limit) {
      const pageNumber = parseInt(page);
      const pageSize = parseInt(limit);

      const items = await Inventory.find(filter)
        .skip((pageNumber - 1) * pageSize)
        .limit(pageSize);

      const totalItems = await Inventory.countDocuments(filter);

      res.json({
        totalItems,
        currentPage: pageNumber,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        items,
      });
    } else {
      // Return all items without pagination if no pagination parameters are provided
      const items = await Inventory.find(filter);
      res.json(items);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get low stock inventory items (below a certain stock threshold)
 */
router.get('/low-stock', async (req, res) => {
  try {
    // Find all items with stock less than the LOW_STOCK_THRESHOLD
    const lowStockItems = await Inventory.find({ stock: { $lt: LOW_STOCK_THRESHOLD } });
    res.json(lowStockItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Get high stock inventory items (above a certain stock threshold)
 */
router.get('/high-stock', async (req, res) => {
  try {
    // Find all items with stock greater than the HIGH_STOCK_THRESHOLD
    const highStockItems = await Inventory.find({ stock: { $gt: HIGH_STOCK_THRESHOLD } });
    res.json(highStockItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Read a single inventory item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update an inventory item by ID
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedItem) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(updatedItem);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete an inventory item by ID
router.delete('/:id', async (req, res) => {
  try {
    const deletedItem = await Inventory.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json({ message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/sku/:sku/update-stock', async (req, res) => {
  try {
    const { change, updatedBy, reason } = req.body;

    // Find the item by SKU
    const item = await Inventory.findOne({ sku: req.params.sku });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Update the stock
    item.stock += change;

    // Record the stock change in the history
    item.stockHistory.push({
      change,
      updatedBy,
      reason, // Add reason for stock change
      date: new Date(),
    });

    // Save the updated item
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/sku/:sku/update-stock-received', async (req, res) => {
  try {
    const { quantity, dueDate } = req.body;

    // Find the item by SKU
    const item = await Inventory.findOne({ sku: req.params.sku });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Update stockNeedToReceived field
    item.stockNeedToReceived = { quantity, dueDate };

    // Save the updated item
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/sku/:sku/add-request', async (req, res) => {
  try {
    const { requestBy } = req.body;
    const item = await Inventory.findOne({ sku: req.params.sku });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    item.productRequests.push({
      requestBy,
      requestedOn: new Date(),
    });
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
