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
    const reviewCollection = dataBase.collection("reviews");
    const cartCollection = dataBase.collection("carts");
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

    // menu functionalities =======================================

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

    // carts functionalities =======================================

    // get all carts filtered by single user
    app.get("/carts", async (req, res) => {
      const { query } = req.query;
      // const carts = await cartCollection
      //   .find({ customer_email: query })
      //   .toArray();
      const carts = await cartCollection
        .aggregate([
          { $match: { customer_email: query } },
          {
            $lookup: {
              from: "menu",
              localField: "menuId",
              foreignField: "_id",
              as: "menuDetails",
            },
          },
          {
            $unwind: "$menuDetails",
          },
          {
            $project: {
              _id: 1,
              menuId: 1,
              name: "$menuDetails.name",
              image: "$menuDetails.image",
              category: "$menuDetails.category",
              price: "$menuDetails.price",
            },
          },
        ])
        .toArray();
      res.send(carts);
    });

    // post a customer's order
    app.post("/carts", async (req, res) => {
      try {
        const food = req.body;
        const result = await cartCollection.insertOne(food);
        res.status(200).send(result);
      } catch (error) {
        res.send({
          message: "Error creating order",
          error: error,
        });
      }
    });

    // delete a single cart filtered by cart id
    app.delete("/carts/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await cartCollection.deleteOne({ _id: id });
      res.send(result);
    });

    // rewards functionalities =======================================

    // get all rewards
    app.get("/reviews", async (req, res) => {
      const rewards = await reviewCollection.find().toArray();
      res.json(rewards);
    });

    // users functionalities =======================================

    // get all users
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // get a single user id
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne(
        { email: email },
        { projection: { _id: 1 } }
      );
      res.status(200).send(user._id);
    });

    // create a single user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const check = await userCollection.findOne({ email: user?.email });
        if (!check) {
          user.role = "customer";
          const result = await userCollection.insertOne(user);
          res.status(201).send(result);
        } else res.send({ message: "User already exists" });
      } catch (error) {
        res.status(400).send({
          message: "Error creating user",
          error: error,
        });
      }
    });

    // delete a single user filtered by _id
    app.delete("/users/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await userCollection.deleteOne({ _id: id });
      res.send(result);
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
