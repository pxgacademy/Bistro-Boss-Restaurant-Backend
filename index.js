const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rm6ii.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const uri = `mongodb://localhost:27017`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Collections
    const dataBase = client.db("BistroBossDB");
    const menuCollection = dataBase.collection("menu");
    const rewardCollection = dataBase.collection("rewards");
    const orderCollection = dataBase.collection("orders");
    const userCollection = dataBase.collection("users");

    // Get category counts for pagination of UI
    app.get("/menu/category-counts", async (req, res) => {
      try {
        const categoryCounts = await menuCollection
          .aggregate([
            {
              $group: {
                _id: "$category", // Group by category field
                count: { $sum: 1 }, // Count the number of items in each category
              },
            },
          ])
          .toArray();
        res.json(categoryCounts);
      } catch (err) {
        res.status(500).send({
          message: "Error fetching category counts",
          error: err,
        });
      }
    });

    // get menu by filtered by category
    app.get("/menu", async (req, res) => {
      const { category } = req.query;
      const skip = parseInt(req.query.skip);
      const limit = parseInt(req.query.limit);

      if (limit) {
        const menu = await menuCollection
          .find({ category })
          .skip(skip)
          .limit(limit)
          .toArray();
        res.json(menu);
      } else {
        const menu = await menuCollection.find({ category }).toArray();
        res.json(menu);
      }
    });

    // get all rewards
    app.get("/rewards", async (req, res) => {
      const rewards = await rewardCollection.find().toArray();
      res.json(rewards);
    });

    // post a customer's order
    app.post("/order-foods", async (req, res) => {
      try {
        const food = req.body;
        const result = await orderCollection.insertOne(food);
        res.status(200).send(result);
      } catch (error) {
        res.send({
          message: "Error creating order",
          error: error,
        });
      }
    });

    // // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run();

app.get("/", (req, res) => {
  res.status(200).send("Bistro Boss is setting");
});

app.listen(port);
