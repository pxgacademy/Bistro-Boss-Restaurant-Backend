require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const jwtSecret = process.env.ACCESS_TOKEN_SECRET;
const stripeToken = process.env.STRIPE_TOKEN;
const stripe = require("stripe")(stripeToken);

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

// JWT token verification middleware
const verifyToken = (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  if (!token)
    return res
      .status(401)
      .send({ message: "Access denied. No token provided." });
  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err)
      return res.status(403).send({ message: "Access denied. Invalid token." });
    req.user = decoded;
    next();
  });
};

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
    const dataBase = client.db("BistroBoss");
    const menuCollection = dataBase.collection("menu");
    const reviewCollection = dataBase.collection("reviews");
    const cartCollection = dataBase.collection("carts");
    const userCollection = dataBase.collection("users");
    const paymentHistoryCollection = dataBase.collection("payment_history");

    // jwt functionalities =======================================
    // signature jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, jwtSecret, { expiresIn: "23h" });
      res.send({ token });
    });

    // verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";
      if (!isAdmin)
        return res
          .status(403)
          .send({ message: "Access denied. You are not an admin." });
      next();
    };

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

      if (!category && !skip && !limit) {
        const menu = await menuCollection.find().toArray();
        return res.send(menu);
      }

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

    // get a single menu item filtered by _id
    app.get("/menu/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const menuItem = await menuCollection.findOne({ _id: id });
      res.send(menuItem);
    });

    // post a menu item
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuItem = req.body;
      const result = await menuCollection.insertOne(menuItem);
      res.send(result);
    });

    // update a single item filtered by _id
    app.put("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = new ObjectId(req.params.id);
      const updatedItem = req.body;
      const result = await menuCollection.updateOne(
        { _id: id },
        { $set: updatedItem }
      );
      res.send(result);
    });

    // delete a menu item filtered by _id
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await menuCollection.deleteOne({ _id: id });
      res.send(result);
    });

    // carts functionalities =======================================

    // get all carts filtered by single user
    app.get("/carts", verifyToken, async (req, res) => {
      const { query } = req.query;
      const carts = await cartCollection
        .aggregate([
          { $match: { customer_email: query } },
          {
            $lookup: {
              from: "menu",
              let: { menuId: { $toObjectId: "$menuId" } },
              pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$menuId"] } } }],
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
    app.post("/carts", verifyToken, async (req, res) => {
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
    app.delete("/carts/:id", verifyToken, async (req, res) => {
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
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // get a single user id
    // app.get("/users/:email", async (req, res) => {
    //   const email = req.params.email;
    //   const user = await userCollection.findOne(
    //     { email: email },
    //     { projection: { _id: 1 } }
    //   );
    //   res.status(200).send(user._id);
    // });

    // check user is admin or customer
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const tokenEmail = req.user.email;
      if (tokenEmail !== email)
        return res.status(403).send({ message: "Forbidden access" });

      let admin = false;
      const user = await userCollection.findOne({ email: email });
      if (user && user?.role) admin = user?.role === "admin";
      res.send({ admin });
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

    // make admin to a single user by patch request
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = new ObjectId(req.params.id);
        const result = await userCollection.updateOne(
          { _id: id },
          { $set: { role: "admin" } }
        );
        res.send(result);
      }
    );

    // delete a single user filtered by _id
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await userCollection.deleteOne({ _id: id });
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.status(200).send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // get all payment histories
    app.get("/payment-history/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      if (email !== req?.user?.email)
        return res.status(403).send({ message: "Forbidden access" });

      const paymentHistories = await paymentHistoryCollection
        .find({ email })
        .toArray();
      res.send(paymentHistories);
    });

    // add payment history
    app.post("/payment-history", async (req, res) => {
      const history = req.body;
      const paymentHistory = await paymentHistoryCollection.insertOne(history);

      const query = {
        _id: {
          $in: history.cartIds.map((id) => new ObjectId(id)),
        },
      };

      const deleteOrders = await cartCollection.deleteMany(query);
      res.send({ paymentHistory, deleteOrders });
    });

    // admin analytics
    app.get("/admin-analytics", async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const items = await menuCollection.estimatedDocumentCount();
      const orders = await paymentHistoryCollection.estimatedDocumentCount();
      const result = await paymentHistoryCollection
        .aggregate([
          { $group: { _id: null, totalSales: { $sum: "$total_price" } } },
          { $project: { _id: 0, totalSales: 1 } },
        ])
        .toArray();
      const revenue = result?.[0] ? result[0].totalSales : 0;
      res.send({ users, items, orders, revenue });
    });

    // order analytics
    // app.get("/order-analytics", async (req, res) => {
    //   const orders = await paymentHistoryCollection
    //    .aggregate([
    //       {
    //         $group: {
    //           _id: { month: { $month: "$date" }, year: { $year: "$date" } },
    //           totalOrders: { $sum: 1 },
    //           totalSales: { $sum: "$total_price" },
    //         },
    //       },
    //       {
    //         $project: {
    //           _id: 0,
    //           month: "$_id.month",
    //           year: "$_id.year",
    //           totalOrders: 1,
    //           averageSales: { $divide: ["$totalSales", "$totalOrders"] },
    //         },
    //       },
    //       {
    //         $sort: { year: 1, month: 1 },
    //       },
    //     ])
    //    .toArray();
    //   res.send(orders);
    // });

    app.get("/order-analytics", async (req, res) => {
      const result = await paymentHistoryCollection
        .aggregate([
          {
            $unwind: "$menuIds",
          },
          {
            $lookup: {
              from: "menu",
              let: { menuIds: { $toObjectId: "$menuIds" } },
              pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$menuIds"] } } }],
              as: "menuDetails",
            },
          },
          {
            $unwind: "$menuDetails",
          },
          {
            $group: {
              _id: "$menuDetails.category",
              quantity: { $sum: 1 },
              revenue: { $sum: "$menuDetails.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: 1,
              revenue: 1,
              averagePrice: { $divide: ["$revenue", "$quantity"] },
            },
          }
        ])
        .toArray();
      res.send(result);
    });

    // error handling
    // app.use((err, req, res, next) => {
    //   console.error(err.stack);
    //   res.status(500).send({ message: "Something went wrong" });
    // });

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
