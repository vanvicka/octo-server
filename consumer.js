var express = require('express');
var app = express();
const crypto = require('crypto')
var http = require('http');
var server = http.Server(app);
var redis = require('redis');
var io = require('socket.io')(server);
const redisClient = redis.createClient({host: '127.0.0.1',port:6379});
redisClient.connect()
redisClient.on("connect",function(){
    console.log('Redis Started');
})
//  redisClient.graph.query()
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
const RedisGraph = require("redisgraph.js").Graph;
require('dotenv').config();
// let graph = new RedisGraph("DRIVERSGRAPH","redis-11587.c280.us-central1-2.gce.cloud.redislabs.com",11587,{username: "default", password:"PENVq3zmIn4kDrJlh6wBxES5h2nhq1AA" });
let graph = new RedisGraph("DRIVERSGRAPH");

var server_port = process.env.PORT || 5050;
// var redis_port = process.env.PORT || 6379;



//initialize admin SDK using serciceAcountKey
admin.initializeApp({
credential: admin.credential.cert(serviceAccount),
databaseURL: "https://octobus-31aaf.firebaseio.com"
});

const db = admin.firestore();
const batch = db.batch();

const auth = admin.auth();
const authenticate = (req,res, next) =>{
  var authHeader = req.headers.authorization;
  if (authHeader) {
    const  token = authHeader.split(' ')[1]; 


    auth.verifyIdToken(token).then((verified) => {
  
      if (verified) {  
        console.log("User Found");
        req.uid = verified.uid;
        next();
    
      }else  {  
      res.sendStatus(403);
      console.log("Not Authorized");
      }
      })
    
  } else {
    res.sendStatus(401);
  }
  
  

}
app.use(express.json());
app.post('/verification',async (req, res) => {
	// do a validation
  var event = req.body
  var uid = event.data.metadata.uid
  var reference = event.data.reference

  console.log(event)


	const shasum = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
	shasum.update(JSON.stringify(req.body))
	const digest = shasum.digest('hex')

	console.log(digest, req.headers['x-paystack-signature'])

	if (digest === req.headers['x-paystack-signature']) {
		console.log('request is legit')
    if (event.data.status == "success") {
      let amount = event.data.amount/100;
      //create transaction

      // const batch = db.batch();
      const ref = db.collection("Passengers").doc(uid).collection("Wallet-TX");   
      const balanceRef = ref.doc("#Balance")                      
      //update wallet
      const txRef = ref.doc(reference)   
      
      await db.runTransaction(async (tx) => {
        const doc = await tx.get(balanceRef) .catch((err)=>{});
        const transactionExist = await tx.get(txRef).exists;
     
        // batch.set(txRef,{bal_After: newBalance,bal_Before: doc.balance,channel: event.data.channel, paidAt: event.data.paid_at,status: event.data.status,userId: uid,amount: amount,transactionId:event.data.id,currency: "NGN"});
        // batch.update(passengerRef,{balance: admin.firestore.FieldValue.increment(amount) });
        
        // Add one person to the city population.
        // Note: this could be done without a transaction
        //       by updating the population using FieldValue.increment()
        if (!transactionExist) {
        const newBalance = doc.data().balance + amount;

        tx.update(balanceRef, {balance: newBalance});
        tx.create(txRef,{bal_After: newBalance,bal_Before: doc.data().balance,channel: event.data.channel, paidAt: event.data.paid_at,status: event.data.status,amount: amount,transactionId:event.data.id,currency: "NGN"});
        }
      });
      res.status(200).json({
        response: "wallet funded successfully",
        // data: wallet,
      });
    }
		// process it
    // res.sendStatus(200);

	} else {
		// pass it
	}
})

app.use(authenticate);

// redisClient.on('ready', function(){
//   console.log("Redis connected");
// });

// redisClient.on('error', function(err){
//   console.log("Something went wrong" , err);
// });

// function getpercentage(arr1, arr2){
//   res = arr1.filter(element=>arr2.includes(element))
// return res.lenght/arr2.lenght * 100;
// }
app.post("/crypto/verification", function(req, res) {
  // Retrieve the request's body
  const event = req.body;
  // Do something with event
  res.send(200);
});
app.get("/setRoles/:role",async (req,res)=>{
  const {userId} = req.uid;
   if (req.params.role == "passenger"){
       admin.auth().setCustomUserClaims(userId,{role: "passenger"}).then(()=>{
        console.log("roles set");
       });
      }
   else
   admin.auth().setCustomUserClaims(userId,{role: "driver"}).then(()=>{
    console.log("roles set");
   });
      
  if(res.statusCode == 404){
    res.status(404).send('Sorry, cant find that');
    }
  res.send("Role set Successfully");
});

app.post("/verify",async (req,res)=>{
 const {reference} = req.body.reference;
 const {userID} = req.uid;
 console.log(req.uid);


 const url = `https://api.paystack.co/transaction/verify/:${reference}`;


 const response = await axios({
  url,
  method: "get",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  },
});
const transactionExist = await db.collection("Transactions").doc(response.data.reference).get().exists;

if (transactionExist) {
  return res.status(409).send("Transaction Already Exist");
}

console.log(response.data);


// check if user have a wallet, else create wallet
//const wallet = await validateUserWallet(user._id);
let wallet = await db.collection("Passengers").doc(userID).collection("Wallet").doc(userID).get().exists;
if (!wallet) {
  //create wallet
  db.collection("Passengers").doc(userID).collection("Wallet").doc(userID).set({balance: 0})
  
}
// create wallet transaction
//await createWalletTransaction(user._id, status, currency, amount);

if (response.data.status == "success") {
  //create transaction
  await db.collection("Transactions").doc(reference).set({userId: userID,amount: response.data.amount,transactionId:response.data.id,currency: "NGN"});
  //update wallet
  await db.collection("Passengers").doc(userID).collection("Wallet_NGN").doc(userID).update({balance: admin.firestore.FieldValue.increment(response.data.amount/100) });
  return res.status(200).json({
    response: "wallet funded successfully",
    data: wallet,
  });
}
});

function msToTime(duration) {
  var seconds = parseInt((duration/1000)%60),minutes = parseInt((duration/(1000*60))%60),hours = parseInt((duration/(1000*60*60))%24),days  = parseInt(duration/(1000*60*60*24));

  var hoursDays = parseInt(days*24);
  hours += hoursDays;
  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;
  return hours + ":" + minutes + ":" + seconds;
}

async function loadDatabase() {

  db.collection("Drivers").onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async changedDoc => {
        var docX = changedDoc.doc.data();
        var  detinedPosition = docX.destination.position;
        var  city = docX.destination.city;
        var user = await auth.getUser(changedDoc.doc.id)

        console.log(user.displayName);

        console.log(`Driver: ${docX.name} - ${user.photoURL}`);
        // users.push({user: {id:changedDoc.id, data:ch0angedDoc.doc.data()}});
          if(changedDoc.type == "added"){
              // await graph.query("MERGE (d:Driver {id: "+ "'"+doc.id+"'"+",name: "+ "'"+docX.name+"'"+",phoneNumber: "+ "'"+docX.phoneNumber+"'"+",plateNo:"+ "'"+docX.plateNo+"'"+",status: "+ "'"+docX.status+"'"+",transportName:"+ "'"+docX.transportName+"'"+",capacity: "+docX.capacity+"})-[r:ROUTE{routehashes: "+"'"+docX.destination.routehashes+"'"+"}]->(c:Destination {city:" + "'"+docX.destination.city+"'"+"})ON MATCH SET d.status = "+ "'"+docX.status+"'"+",d.capacity =  "+ "'"+docX.capacity+"'"+"r.routehashes = "+ "'"+docX.destination.routehashes+"'"+"c.city = "+ "'"+docX.destination.city+"'"+"");
            // await graph.query("MERGE (:Driver {id: "+ "'"+changedDoc.doc.id+"'"+",name: "+ "'"+docX.name+"'"+",position: "+ "point({latitude:6.00,longitude:3.00})" +",photo: "+ "'"+user.photoURL+"'"+",phoneNumber: "+ "'"+docX.phoneNumber+"'"+",plateNo:"+ "'"+docX.plateNo+"'"+",online: "+docX.online+",transportName:"+ "'"+docX.transportName+"'"+",capacity: "+docX.capacity+"})-[:ROUTE{routehashes: "+"'"+routehashes+"'"+"}]->(:Destination {city:" + "'"+city+"'"+"})");
            await graph.query("MERGE (:Driver {id: "+ "'"+changedDoc.doc.id+"'"+",name: "+ "'"+docX.name+"'"+",position: "+ "[23.23040,63.9832]" +",photo: "+ "'"+user.photoURL+"'"+",phoneNumber: "+ "'"+docX.phoneNumber+"'"+",plateNo:"+ "'"+docX.plateNo+"'"+",online: "+docX.online+",transportName:"+ "'"+docX.transportName+"'"+",capacity: "+docX.capacity+"})-[:ROUTE]->(:Destination {city:" + "'"+city+"'"+",position: ["+ detinedPosition+"]})");

          }else if(changedDoc.type == "modified"){
            console.log("Something changed");
            await graph.query("MERGE (d:Driver {id: "+ "'"+changedDoc.doc.id+"'"+"})-[r:ROUTE]->(c:Destination {city:" + "'"+docX.destination.city+"'"+"}) ON MATCH SET d.online = "+docX.online+", d.capacity =  "+docX.capacity+",c.position = ["+detinedPosition+"],c.city = "+ "'"+city+"'"+"");
          }

      });
        
        
  //      //implement redis here 
  //     //  redisClient.json.set(`${doc.id}`, doc.data() )
  // await graph.query("MERGE (d:Driver {id: "+ "'"+doc.id+"'"+",name: "+ "'"+docX.name+"'"+",phoneNumber: "+ "'"+docX.phoneNumber+"'"+",plateNo:"+ "'"+docX.plateNo+"'"+",status: "+ "'"+docX.status+"'"+",transportName:"+ "'"+docX.transportName+"'"+",capacity: "+docX.capacity+"})-[r:ROUTE{routehashes: "+"'"+docX.destination.routehashes+"'"+"}]->(c:Destination {city:" + "'"+docX.destination.city+"'"+"})ON MATCH SET d.status = "+ "'"+docX.status+"'"+",d.capacity =  "+ "'"+docX.capacity+"'"+"r.routehashes = "+ "'"+docX.destination.routehashes+"'"+"c.city = "+ "'"+docX.destination.city+"'"+"");
  // await graph.query("MERGE (:Driver {name: "+ "'"+docX.name+"'"+",phoneNumber: "+ "'"+docX.phoneNummber+"'"+",plateNo:"+ "'"+docX.plateNo+"'"+",status: "+ "'"+docX.status+"'"+",transportName:"+ "'"+docX.transportName+"'"+",capacity: "+docX.capacity+"})-[:ROUTE{routehashes: " +docX.destination.route+"}]->(:Destination {city:" + "'"+docX.destination.city+"'"+"})");

          // await graph.query("MERGE (:Driver {name: "+docX.name+",phoneNumber: +23480654357575,plateNo:'CBA 2345 B',status: 'offline',transportName:'GIGM',capacity: 2})-[:ROUTE{routehash: 'route'}]->(:Destination {city: 'city')");
  //      redisClient.json.set(123457, {name: "thomas"} );
  //     var ans =  await redisClient.json.get(123457);
  //     console.log(ans);
      // drivers.push({user: {id:doc.id,}});

  //   })}, error => {console.log("failed to retrieve")});
  //   setInterval(() => {
  //     console.log(users);

  //   }, 9000);
}); 


}



io.use((client, next) => {
  token = client.handshake.headers.token;
  

    console.log(client.id);
  auth.verifyIdToken(token).then((verified) => {
  io.engine.generateId = () => verified.uid

  if (verified.uid == client.id) {  
    console.log("User Found");
    next();

  }else  {
    next(new Error("invalid: Not an Authorized user"));
    console.log("Not Authorized");
  }
  })
  .catch((e)=>{ 
    console.log("auth error")});
})




function delay(delayInms) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(2);
    }, delayInms);
  });
}




  io.on('connection', async function (client) { 
  // io.in("drivers_Room").clients((err, clients) => {
  //  let activeSockets =  drivers.filter(socket => clients.includes(socket.id))
  //   // clients.forEach( socketId => {
  //   //   if (drivers.some(driver => driver === socketId)){} } )
  //   console.log(clients) // an array of socket ids
  // })

  // client.on('join', function(room) {
  //   console.log(client.id, "joined", room);
  //   client.join(room);
  // })
 
  // client.on('timer_countdown',async function name(data) {
  // let doc = await db.collection("Requests").where("passengerId", "==" ,client.id).where("status", "==","ongoing").get();
  // if (!doc.empty && doc.docs[0].exists) {
  //   console.log(client.id,"has ongoing request");
  //   var driverId = doc.docs[0].get("driverId");
  //   client.leave(`DriverRoom_${driverId}`);
  //   console.log(client.id,`has left request DriverRoom_${driverId}`);
  //  }
  // var interval = setInterval(function(){
  //     var a = new Date().getTime();

  //     var now = new Date();
  //     var b = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 24, 0, 0, 0).getTime();
  //     io.to(client.id).emit('timer_countdown', msToTime(b-a));
  //     console.log(msToTime(b-a));

  //     if ("00:00:00" === msToTime(b-a)) {
  //       clearInterval(interval);
  //     }
      
  //     },5000);
  // });

  // client.on('typing', function name(data) {
  //   console.log(data);
  //   io.emit('typing', data)
  // });

  client.on('message', function name(data) {
    console.log(data);
    io.sockets.emit('message', data)
  })
  client.on('response', async function name(responseData) {
    console.log(`responseStatus:${responseData.matching_Id}`)
    await redisClient.HSET(`responseStatus:${responseData.matching_Id}`, 'status', responseData.status)
    // await redisClient.EXPIRE(`responseStatus:${responseData.matching_Id}`,20)


    //TO BE DEPRECATED
    // resData = responseData;
    // console.log(responseData);
    // console.log(`Id from Driver:${responseData["id"]}`);
    // console.log(`Id from redisgraph:${record.get("d").properties.id}`);
    // io.to(responseData["id"]).emit('response', record.get("d").properties);
    // client.broadcast.emit("response", data["status"]);
    // client.leave(data["room"]);    
  })

  client.on('request', async function request(jsonData) {  
   var data = JSON.stringify(jsonData)
    console.log(data)  
   await redisClient.XADD('requests','*', {data});
  });

  // client.on("ride_request", async function name(data){
  //   //redis stream buffer

  //   const balance = await db.collection("Passengers").doc(client.id).collection("Wallet-TX").doc("#Balance").get().data().balance
  //   console.log("passenger_balance ->", balance);
    
  //   const availableDrivers = await graph.query("MATCH (d:Driver{online: true,transportName: "+"'"+data.transportName+"'"+"})-[w:ROUTE]->(:Destination{city: "+"'"+data.destination+"'"+"}) WHERE "+"'" +data.hashvalue+ "'"+"  w.routehashes IN AND d.capacity > 0  RETURN d");
  //   //List of available drivers and their information
  //   // const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${data.pickuplocation.latitude},${data.pickuplocation.longitude}&destination=${data.destinationdetails[0].latitude},$${data.destinationdetails[0].longitude}&key=${process.env.GOOGLE_MAP_API_KEY}`;
  //   const url = 'https://api.openrouteservice.org/optimization';

  //   const routeDetails = await axios.get({url,
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Accept: "application/json",
  //       Authorization: process.env.OPENROUTE_APIKEY,
  //     },

  //     body: `{"jobs":[
  //                 {"id":1,"service":300,"amount":[1],"location":[1.98465,48.70329],"skills":[1],"time_windows":[[32400,36000]]},
  //                 {"id":2,"service":300,"amount":[1],"location":[2.03655,48.61128],"skills":[1]},
  //                 {"id":3,"service":300,"amount":[1],"location":[2.39719,49.07611],"skills":[2]},
  //                 {"id":4,"service":300,"amount":[1],"location":[2.41808,49.22619],"skills":[2]},
  //                 {"id":5,"service":300,"amount":[1],"location":[2.28325,48.5958],"skills":[14]},
  //                 {"id":6,"service":300,"amount":[1],"location":[2.89357,48.90736],"skills":[14]}],
  //            "vehicles":[
  //             {"id":0,"profile":"driving-car","start":[2.35044,48.71764],"end":[2.35044,48.71764],"capacity":[4],"skills":[1,14],"time_window":[28800,43200]},
  //             {"id":1,"profile":"driving-car","start":[2.35044,48.71764],"end":[2.35044,48.71764],"capacity":[4],"skills":[2,14],"time_window":[28800,43200]}]}`
  //   });
  //   var vehicles =  []
  //   // routeDetails['routes'];
  //  for (let index = 0; index < vehicles.length; index++) {

    
  //   var timeTraveled = (routeDetails.durationValue / 60) * 0.2;
  //   var distanceTraveled = (routeDetails.distanceValue / 60) * 0.2;
  //   var totalFareAmount = (timeTraveled + distanceTraveled);
  //   var ridePrice = totalFareAmount;
    
  //   console.log(availableDrivers._resultsCount);  
  //    if(availableDrivers._resultsCount == 0){
  //     io.to(data["id"]).emit('response_error', "DRIVER_NOT_AVAILABLE");
  //   }else if(balance < ridePrice){
  //     io.to(client.id).emit('response_error', "INSUFFICIENT BALANCE");
  //   }else
      
  //     //send sms notification to driver using twilio and Firebase cloud messaging
  //     //twilioClient.create();
      
  //     // admin.messaging().sendToDevice(registrationToken,payload,options);
      
  //     io.sockets.to(driver.properties.id).emit("request", data);
  //     await delay(150000);
  //     console.log("15 sec Elapsed");
  //     //  waiting for response...
  //     // io.sockets.to(availableDrivers[i].id).emit("request", data);
  //     if(resData["status"] == "accepted") {
  //       var now = new Date();
  //       var expirationTimestamp =  now.setMinutes(now.getMinutes + routeDetails.durationValue);

  //       const driverRef = db.collection("Drivers").doc(resData["id"]);   
  //       const requestRef = db.collection("Requests").doc();  
        
  //     console.log("Accepted");
  //     batch.set(requestRef,{"expirationTimestamp": expirationTimestamp,driverPlateNo: `${record.get("d").properties.plateNo}`,driverId: `${record.get("d").properties.id }`,driverName: `${record.get("d").properties.name }`,driverPhoneNo: `${record.get("d").properties.phoneNumber}`,driverPhoto: `${record.get("d").properties.photo }`,transportName: `${record.get("d").properties.transportName }`,status: "ongoing", passengerId: data["id"], passengerId2: client.id ,passengerName: data["name"],passengerPhoneNo: data["phoneNo"],passengerPhoto: data["photo"],destination: data["destination"],ridePrice: data["ridePrice"],pickuplocation: data["pickuplocation"]});
  //     batch.update(driverRef,{capacity: admin.firestore.FieldValue.increment(-1) });
  //     client.join(resData["DriverRoom_id"]);
  //     batch.commit();
  //     //{passengerName: Arya Stark, pickuplocation: {latitude: 7.306739700000001, name: Glofes Filling Staion, vicinity: Futa Nothgate, longitude: 7.306739700000001}, driverId: zl81T2KUwoUqjmB38PISbHCN33O2, driverPhoneNo: 08065437274, driverPhoto: https://randomuser.me/api/portraits/men/64.jpg, destination: Lagos, passengerId: eFY5HAkmgzelH2F5AOfPheOv4o33, driverName: John Armstrong, ridePrice: 5000, driverPlateNo: GDH 33 YS, passengerPhoto: 'https://randomuser.me/api/portraits/women/90.jpg', status: ongoing}
  //     setTimeout(async function(){
  //      let doc = await requestRef.get();
  //       if (doc.data()["status"] == "ongoing") {
  //         requestRef.update({status: "cancelled"});
  //       }

  //     }, expirationTimestamp * 60 * 1000);
  //     continue;
  //   }
  // }
  // });

  client.on('start_Trip',async function name(data) {
    console.log(data);
    console.log(data["requestId"]);
    let doc = await db.collection("Requests").doc(data["requestId"]).update({status: "pending"});

    // let doc = await db.collection("Requests").doc(data["requestId"]).get();
    // console.log(doc.get("passengerId"));

    // io.to(doc.get("passengerId")).emit('start_Trip', data);
    
  })

  client.on('acknowledge_Trip',async function name(data) {
    let doc = await db.collection("Requests").where("passengerId", "==" ,client.id).get();
    if (!doc.empty && doc.docs[0].exists) {
      console.log(doc.docs[0].id);
      await db.collection("Requests").doc(doc.docs[0].id).update({status: "completed"});
      io.to(doc.get("driverId")).emit('start_Trip', data);

     }
    

 
    
  })

  client.on('location', async function name(data) {
    console.log(data.pLineCoordinates.length);
    io.to(data["DriverRoom_id"]).emit('location', data);
    response = await redisClient.graph.query( 'DRIVERSGRAPH',`MERGE (d:Driver {id: '${client.id}'})-[r:ROUTE]->(:Destination) ON MATCH SET d.position = [${data.lng},${data.lat}],r.distanceValue = ${data["distanceValue"]},r.durationValue = ${data["durationValue"]},r.requestId = '${data["requestId"]}',r.pLineCoordinates = [${data.pLineCoordinates}],r.heading = ${data["heading"]},r.DriverRoom_id = '${data["DriverRoom_id"]}'`)
    console.log(response) 
  })


  client.on('disconnect', function () {
    // console.log('client disconnect...', client.id);
    // io.in("drivers_Room").clients((err, clients) => {
    // if(clients.includes(client.id)){
    // db.collection("Drivers").doc(client.id).update({status: "offline"});
    // }
    // })
  })

  client.on('cancel_ride', async function (data) {
    console.log('Ride has been cancelled by:', client.id);
   let doc = await db.collection("Requests").doc(data["requestId"]).get();
    if (doc.exists && doc.data()["passengerId"], '==', client.id) {
       db.collection("Requests").doc(data["requestId"]).update({status: "cancelled"}).then((w) =>{
        client.leave(`driverRoom_${doc.data()["driverId"].substring(0,5)}`);    
 
        io.to(doc.data()["driverId"]).emit('cancel_ride', data);
         console.log("Request Cancelled By Passenger and Deleted",w);
        });
    }else if(doc.exists && doc.data()["driverId"], '==', client.id){ 
      db.collection("Requests").doc(data["requestId"]).update({status: "cancelled"}).then((w) =>{
        // client.leave(`driverRoom_${doc.data()["driverId"]}`);    
        io.to(doc.data()["passengerId"]).emit('cancel_ride', data);
        console.log("Request Cancelled By Driver and Deleted",w);
    });
    }
    else 
      console.log("Such request dont Exist");
  });

    let doc = await db.collection("Requests").where("passengerId", "==" ,client.id).where("status", "==","ongoing").get();

    if (!doc.empty && doc.docs[0].exists) {
     console.log(client.id,"has ongoing request");
     var driverId = doc.docs[0].get("driverId")
     var driverRoomId = driverId.substring(0,5);
     //emit driver last known loction to passwnger
     const driverPosition = await graph.query("MATCH (d:Driver{id: "+"'"+driverId+"'"+"})-[w:ROUTE{requestId: "+"'"+doc.docs[0].id+"'"+"}]->(:Destination) RETURN w");
     data = driverPosition.next().values()
     console.log(data[0].properties);
     io.to(client.id).emit('location', data[0].properties);
    // //  io.to(client.id).emit('driverLastKnownPosition', data );
  
     client.join(`DriverRoom_${driverRoomId}`);
    //  console.log(client.id, `joined DriverRoom_${driverRoomId}`);
    }

});


server.listen(server_port, async function (err) {
  if (err){
    throw err
    console.log(err);
  }

// data = {
//  "id":"xwnonwxnij2xei",
// 'name': 'George Noble', 
// 'photo': 'url', 
// 'phoneNo': "0904583943",
// "destination":"Abuja",
// "transportName":"Lion Heart",
// "pickuplocation":[2.89357,48.90736] 
// }
// var res = JSON.stringify(data)

  // loadDatabase();
//   await redisClient.connect();
  // await redisClient.XADD('mystream','*', {name:"Ruth Taylor",position:"[87.8909,67.9809]"});
  // var ping = await redisClient.xRead({key: "mystream",id: '0'});
  // console.log(ping[0]["messages"]);
  console.log('Listening on port %d', server_port);

// var user =  await auth.updateUser('zl81T2KUwoUqjmB38PISbHCN33O2',{email: "fobepac719@bulkbye.com",password: 'test123'})

  // console.log(await redisClient.HSET('responseStatus', 'status', 'accepted'))
  // console.log(await redisClient.EXPIRE('acceptanceStatus',20))
  // console.log(await redisClient.hGet('acceptanceStatus','status'))

  // await graph.query("CREATE (d:Driver{name:'Mary Jane',routehashes: ['evecevefwqw', 'wvewefewfef', 'vevweefewfewf']})");

  // var data = {
  //   "transportName": "GIGM",
  //   "destination":"Lagos"
  // };
  // var routehashes =   data.routehashes;

  // console.log(data.routehashes);
  // let results = await graph.query("MERGE (d:Driver {id: "+ "'"+"obhrurhuhrbrf3ufug3ubb4f"+"'"+"})-[r:ROUTE]->(:Destination) ON MATCH SET r.routehashes = "+routehashes+" ");
  

  // let results = await redisClient.graph.query( 'DRIVERSGRAPH',`MATCH (d:Driver{online: true,transportName: '${data.transportName}'})-[w:ROUTE]->(:Destination{city: '${data.destination}' })WHERE d.capacity > 0  RETURN d`);
  // // let record = results._results;
  //   console.log(results.data[0][0][2][1][0][1]);
  //   for (let index = 0; index < results.data.length; index++) {
  //   var idNum = results.data[index][0][0][1]
  //   var driverCapacity = results.data[index][0][2][1][8][2];
  //   var transportName = results.data[index][0][2][1][7];
  //   // var position =    results.data[index][0][2][1][2][1]

  //   // console.log(results.data[index][0][2][1][2][1]);

  //   console.log(results.data[index][0][2][1]);
  //   }
    




//   let availableDrivers = await graph.query("MATCH (d:Driver{online: true, transportName: 'GIGM'})-[w:ROUTE]->(c:Destination)   RETURN d,w");
//   // console.log(availableDrivers._results[1]._values[0]..properties);
//   console.log(availableDrivers._resultsCount);
// while(availableDrivers.hasNext()){
//   let record =availableDrivers.next();
//   // console.log(`Driver Id : ${record.get("d").properties.city}`);
//   console.log(`Driver Id : ${record.values()}`);
//   // console.log(availableDrivers._results);
});



module.exports = {io,admin,db,redisClient}