/* eslint-disable radix */
// routes/inventory.js
const express = require('express');
const router = express.Router();
const Inventory = require('../../models/inventory.model');
const LOW_STOCK_THRESHOLD = 10;
const HIGH_STOCK_THRESHOLD = 14;

// Create a new inventory item
router.post('/', async (req, res) => {
  try {
    const item = new Inventory(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});
router.get('/summary', async (req, res) => {
  try {
    const inventorySummary = await Inventory.aggregate([{
      $group: {
        _id: '$category',
        stockTotal: {
          $sum: '$stock'
        },
        StockToBeReceivedTotal: {
          $sum: '$stockNeedToReceived.quantity'
        }
      }
    }, {
      $project: {
        _id: 0,
        category: '$_id',
        stockTotal: 1,
        StockToBeReceivedTotal: 1
      }
    }]);
    res.json(inventorySummary);
  } catch (error) {
    res.status(500).json({
      message: 'Server error while fetching inventory summary'
    });
  }
});
router.get('/inventory-with-requests', async (req, res) => {
  try {
    const itemsWithRequests = await Inventory.find({
      'productRequests.0': {
        $exists: true
      }
    });
    if (!itemsWithRequests.length) {
      return res.status(404).json({
        message: 'No inventory items with product requests found'
      });
    }
    res.json(itemsWithRequests);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
router.get('/stock-history', async (req, res) => {
  try {
    // Find all inventory items and select only necessary fields
    const allItems = await Inventory.find({}, 'name category status stockHistory images stock sku');

    // Aggregate all stock histories into a single array with additional fields
    const allStockHistory = [];
    allItems.forEach(item => {
      item.stockHistory.forEach(history => {
        allStockHistory.push({
          name: item.name,
          category: item.category,
          status: item.status,
          change: history.change,
          updatedBy: history.updatedBy,
          reason: history.reason,
          date: new Date(history.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          // Format date
          images: item.images,
          stock: item.stock,
          _id: history._id,
          sku: item.sku
        });
      });
    });

    // Sort the aggregated stock history by date in ascending order
    const sortedStockHistory = allStockHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
    res.json(sortedStockHistory);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
router.get('/stock-out', async (req, res) => {
  try {
    const stockOutItems = await Inventory.find({
      stock: 0
    }, 'name category status stock sku images');
    if (stockOutItems.length === 0) {
      return res.status(404).json({
        message: 'No stock out products found'
      });
    }
    res.json(stockOutItems);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// Read all inventory items
router.get('/', async (req, res) => {
  try {
    const {
      page,
      limit,
      category,
      status
    } = req.query;

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
      const items = await Inventory.find(filter).skip((pageNumber - 1) * pageSize).limit(pageSize);
      const totalItems = await Inventory.countDocuments(filter);
      res.json({
        totalItems,
        currentPage: pageNumber,
        pageSize,
        totalPages: Math.ceil(totalItems / pageSize),
        items
      });
    } else {
      // Return all items without pagination if no pagination parameters are provided
      const items = await Inventory.find(filter);
      res.json(items);
    }
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

/**
 * Get low stock inventory items (below a certain stock threshold)
 */
router.get('/low-stock', async (req, res) => {
  try {
    // Find all items with stock less than the LOW_STOCK_THRESHOLD
    const lowStockItems = await Inventory.find({
      stock: {
        $lt: LOW_STOCK_THRESHOLD
      }
    });
    res.json(lowStockItems);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

/**
 * Get high stock inventory items (above a certain stock threshold)
 */
router.get('/high-stock', async (req, res) => {
  try {
    // Find all items with stock greater than the HIGH_STOCK_THRESHOLD
    const highStockItems = await Inventory.find({
      stock: {
        $gt: HIGH_STOCK_THRESHOLD
      }
    });
    res.json(highStockItems);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// Read a single inventory item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// Update an inventory item by ID
router.put('/:id', async (req, res) => {
  try {
    const updatedItem = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
      new: true
    });
    if (!updatedItem) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }
    res.json(updatedItem);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});

// Delete an inventory item by ID
router.delete('/:id', async (req, res) => {
  try {
    const deletedItem = await Inventory.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }
    res.json({
      message: 'Item deleted'
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
router.put('/sku/:sku/update-stock', async (req, res) => {
  try {
    const {
      change,
      updatedBy,
      reason
    } = req.body;

    // Find the item by SKU
    const item = await Inventory.findOne({
      sku: req.params.sku
    });
    if (!item) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }

    // Update the stock
    item.stock += change;

    // Record the stock change in the history
    item.stockHistory.push({
      change,
      updatedBy,
      reason,
      // Add reason for stock change
      date: new Date()
    });

    // Save the updated item
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
router.put('/sku/:sku/update-stock-received', async (req, res) => {
  try {
    const {
      quantity,
      dueDate
    } = req.body;

    // Find the item by SKU
    const item = await Inventory.findOne({
      sku: req.params.sku
    });
    if (!item) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }

    // Update stockNeedToReceived field
    item.stockNeedToReceived = {
      quantity,
      dueDate
    };

    // Save the updated item
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
router.put('/sku/:sku/add-request', async (req, res) => {
  try {
    const {
      requestBy
    } = req.body;
    const item = await Inventory.findOne({
      sku: req.params.sku
    });
    if (!item) {
      return res.status(404).json({
        message: 'Item not found'
      });
    }
    item.productRequests.push({
      requestBy,
      requestedOn: new Date()
    });
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});
module.exports = router;