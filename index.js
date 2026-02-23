require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 3000;

const serviceAccount = require("./assignment11-194e2-firebase-adminsdk-fbsvc-8db3d2bf1c.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


// Middleware
app.use(cors());
app.use(express.json());

// verifiFirebase Token
const verifyFbToke=async(req,res,next)=>{
    const token =req.headers.authorization
    if(!token || !token.startsWith('Bearer ')){
        return res.status(401).send({message:'Unauthorized access: No token provided'})
       
    }
    // firebase verify
    try{
        const idToken=token.split(' ')[1]
     const decoded=await admin.auth().verifyIdToken(idToken)
         
         req.user = decoded;
         req.decoded_email=decoded.email

        next()

    }
    catch(err){
        return res.status(401).send({message:'unauthorized access'})

    }
    
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0nerjvp.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // MongoDB Collections
    const db = client.db('PublicReport');
    const usersCollection = db.collection('userCollection');
    const AllissuesCollection = db.collection('allIssues');

    console.log("Successfully connected to MongoDB!");

    // ---------admin verify
   const verifyAdmin = async (req, res, next) => {
    const email = req.user?.email; 
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    
    const isAdmin = user?.role === 'admin';
    if (!isAdmin) {
        return res.status(403).send({ message: 'Forbidden access: Admins only!' });
    }
    next();
};
// -------------staff verify
const verifyStaff = async (req, res, next) => {
    const email = req.user?.email;
    const query = { email: email };
    const user = await usersCollection.findOne(query);
    
    const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';
    if (!isStaffOrAdmin) {
        return res.status(403).send({ message: 'Forbidden access: Staff or Admin only!' });
    }
    next();
};
    // ------------------- Issues Related APIs -------------------
    
    // Add new issue
    app.post('/user', async (req, res) => {
      const data = req.body;
      const result = await AllissuesCollection.insertOne(data);
       res.send(result);
    });

    // Get all issues
    app.get('/allissues', async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 6;

       
        const query = {
            title: { $regex: search, $options: 'i' }
        };

        
        const result = await AllissuesCollection.find(query)
            .sort({ createdAt: -1 }) 
            .skip(page * size)
            .limit(size)
            .toArray();

        
        const count = await AllissuesCollection.countDocuments(query);

        res.send({ result, count });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }
});

app.patch('/issue/upvote/:id', verifyFbToke, async (req, res) => {
    try{

        const id = req.params.id;
    const { email } = req.body; 

    // get issues by id
    const issue = await AllissuesCollection.findOne({ _id: new ObjectId(id) });

    if (!issue) {
         return res.status(404).send({ message: "Issue not found" });
    }

    //  You cannot upvote your own issues
    if (issue.email === email) {
        return res.status(403).send({ message: "You cannot upvote your own issue!" });
    }

    // duplicate vote not allowed
    const upvotedBy = issue.upvotedBy || [];
    if (upvotedBy.includes(email)) {
        return res.status(400).send({ message: "You have already upvoted this issue!" });
    }

    
    const result = await AllissuesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
            $inc: { upvotes: 1 }, 
            $push: { upvotedBy: email } 
        }
    );

    res.send(result);


    }
    catch (error) {
        console.error("Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
    }

    
});


// 
app.get('/allIssuess', async (req, res) => {
    try {
        const result = await AllissuesCollection.find().toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Data fetch korte somoshsha hoyeche" });
    }
});

    // Get latest 3 issues for home
    app.get('/home-issues', async (req, res) => {
      const result = await AllissuesCollection.find().sort({ _id: -1 }).limit(3).toArray();
      res.send(result);
    });

    // Get single issue details
    app.get('/issue/:id', async (req, res) => {
      const id = req.params.id;
      const result = await AllissuesCollection.findOne({ _id: new ObjectId(id) });
       res.send(result);
    });

    // Update issue status
    app.patch('/allIssues/status/:id',verifyFbToke, verifyStaff, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const result = await AllissuesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );
      res.send(result);
    });

    // Delete issue
    app.delete('/myIssues/:id',verifyFbToke, async (req, res) => {
      const id = req.params.id;
      const result = await AllissuesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // Get issues for a specific user by email
app.get('/myIssues',verifyFbToke, async (req, res) => {
    const email = req.query.email;
    if (req.user.email !== email) {
        return res.status(403).send({ message: 'Forbidden access' });
    }
    if (!email) {
        return res.status(400).send({ message: 'Email is required' });
    }
    const query = { email: email };
    const result = await AllissuesCollection.find(query).toArray();
    res.send(result);
});
app.patch('/allIssues/:id',verifyFbToke, async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = {
    $set: {
      title: updatedData.title,
      category: updatedData.category,
      description: updatedData.description,
    },
  };
  const result = await AllissuesCollection.updateOne(filter, updateDoc);
  res.send(result);
});

    // ------------------- User Related APIs -------------------

    // Register user
    app.post('/registerdUsers', async (req, res) => {
      const data = req.body;
      const existingUser = await usersCollection.findOne({ email: data.email });
      if (existingUser) return res.send({ message: 'user already exists', insertedId: null });
      const result = await usersCollection.insertOne(data);
      res.send(result);
    });

    // Get all users (For Admin)
    app.get('/users',verifyFbToke,verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Check Admin Status
    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ admin: user?.role === 'admin' });
    });

    // Make User Admin
    app.patch('/users/admin/:id',verifyFbToke,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: 'admin' } }
      );
      res.send(result);
    });
    app.get('/citizen-stats/:email', async (req, res) => {
    const email = req.params.email;
    const query = { email: email };

    
    const totalIssues = await AllissuesCollection.countDocuments(query);

    
    const pendingIssues = await AllissuesCollection.countDocuments({ 
        ...query, 
        status: "Pending" 
    });

    
    const resolvedIssues = await AllissuesCollection.countDocuments({ 
        ...query, 
        status: "Resolved" 
    });

   
    const user = await usersCollection.findOne(query);
    const totalPayments = user?.isPremium ? 2000 : 0; 

    res.send({
        totalIssues,
        pendingIssues,
        resolvedIssues,
        totalPayments
    });
});

app.get('/admin-stats',verifyFbToke, verifyAdmin, async (req, res) => {
    const totalUsers = await usersCollection.countDocuments();
    const totalIssues = await AllissuesCollection.countDocuments();
    const resolvedIssues = await AllissuesCollection.countDocuments({ status: "Resolved" });
    const premiumUsers = await usersCollection.countDocuments({ isPremium: true });

    
    const revenue = premiumUsers * 2000; 

    res.send({
        totalUsers,
        totalIssues,
        resolvedIssues,
        premiumUsers,
        revenue
    });
});

app.get('/admin-statistics',verifyFbToke, verifyAdmin, async (req, res) => {
    try {
        const totalIssues = await AllissuesCollection.estimatedDocumentCount();
        
        
        const boostedIssuesList = await AllissuesCollection.find({ priority: "High" }).toArray();
        
        const totalBoosted = boostedIssuesList.length;
        const totalRevenue = totalBoosted * 100;

        const categoryStats = await AllissuesCollection.aggregate([
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ]).toArray();

        res.send({
            totalIssues,
            totalBoosted,
            totalRevenue,
            categoryStats,
            boostedIssues: boostedIssuesList 
        });
    } catch (error) {
        res.status(500).send({ message: "Stats আনতে সমস্যা হয়েছে" });
    }
});
// Make User Staff
app.patch('/users/staff/:id',verifyFbToke, verifyAdmin, async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };
    const updatedDoc = {
        $set: { role: 'staff' }
    };
    const result = await usersCollection.updateOne(filter, updatedDoc);
    res.send(result);
});

    // Get User Stats (Premium & Issue Count)
    app.get('/users/stats/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isPremium = user?.role === 'premium' || user?.isPremium === true;
      const issueCount = await AllissuesCollection.countDocuments({ email: email });
      res.send({ isPremium, issueCount });
    });

    // Update User to Premium after Payment
    app.patch('/users/make-premium/:email', async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.updateOne(
        { email: email },
        { $set: { isPremium: true,}}
      );
      res.send(result);
    });

    app.patch('/issue/boost/:id',verifyFbToke, async (req, res) => {
    const id = req.params.id;
    const { transactionId } = req.body; 
    const filter = { _id: new ObjectId(id) };
    const issues = await AllissuesCollection.findOne(filter);
    if (issues.priority !== 'High') {
        const updateDoc = {
            $set: { 
                priority: "High",
                transactionId: transactionId || "N/A" 
            },
            $push: {
                timeline: { 
                    status: "Boosted",
                    message: `Priority upgraded to High via payment of 100 TK. TransID: ${transactionId}`,
                    time: new Date()
                }
            }
        };
        const result = await AllissuesCollection.updateOne(filter, updateDoc);
        res.send(result);
    } else {
        
        res.status(400).send({ message: "Already Boosted" });
    }
});



    // ------------------- Stripe Payment API -------------------
    
    app.post('/create-checkout-session', async (req, res) => {
      try {
        const data = req.body;
        const amount = 2000;

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'BDT',
              unit_amount: amount,
              product_data: { 
                name: "Premium Membership",
                description: "Get unlimited report access forever!"
              },
            },
            quantity: 1,
          }],
          customer_email: data.email,
          mode: 'payment',
          metadata: { userEmail: data.email },
          success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?email=${data.email}`,
          cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
        });
        res.send({ url: session.url });
      } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ error: error.message });
      }
    });

    
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { price, email, issueId } = req.body; 
        const amount = parseInt(price * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'BDT',
                    unit_amount: amount,
                    product_data: { 
                        name: "High Priority Upgrade",
                        description: "Admins are notified immediately!"
                    },
                },
                quantity: 1,
            }],
            customer_email: email,
            mode: 'payment',
            metadata: { 
                userEmail: email,
                issueId: issueId 
            },
           success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success-boost?email=${email}&issueId=${issueId}`,
            cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelledd`,
        });
        res.send({ url: session.url });
    } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).send({ error: error.message });
    }
});


  }
  
  finally {
    // Connections stay open
  }
}
run().catch(console.dir);

app.get('/', (req, res) => res.send('Assignment 11 Server is Running'));

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});