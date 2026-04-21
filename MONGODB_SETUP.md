# MongoDB Integration & Database Setup

## ✅ Completed Tasks

### 1. MongoDB Connection
- **Database**: `mongodb://localhost:27017/Vaccilink`
- **Connection Status**: Automatic connection with retry logic
- Improved error handling with exponential backoff (retries every 5 seconds)

### 2. Collections Created Automatically
The following collections are automatically created with proper indexes when the server starts:

#### **Parents Collection**
- Stores parent/child information and vaccination history
- Indexes:
  - `email` (unique lookup)
  - `phone` (unique lookup)  
  - `childID` (quick access)

#### **Appointments Collection**
- Stores vaccination appointments
- Indexes:
  - `childID` (find appointments by child)
  - `centerId` (find appointments by center)
  - `appointmentDate` (sort by date)

#### **Centers Collection**
- Stores vaccination center information
- Indexes:
  - `centerId` (unique identifier)

#### **Notifications Collection**
- Stores reminder and overdue notifications
- Indexes:
  - `childID` (find notifications for specific child)

#### **Vaccinators Collection**
- Stores vaccinator profiles
- Indexes:
  - `email` (unique for login)
  - `vaccinatorID` (unique identifier)

## 🚀 How to Start the Server

1. **Ensure MongoDB is running** on your system:
   ```bash
   # Start MongoDB (if not running as a service)
   mongod
   ```

2. **Start the VacciLink server**:
   ```bash
   cd c:\Users\Dell\Desktop\Vaccilink-kanchan-timeline-records
   npm install  # First time only
   npm start    # or node server.js
   ```

3. **Expected Console Output**:
   ```
   ✅ MongoDB Connected to: mongodb://localhost:27017/Vaccilink
   ✅ Parent collection indexes created
   ✅ Appointment collection indexes created
   ✅ Center collection indexes created
   ✅ Notification collection indexes created
   ✅ Vaccinator collection indexes created
   ✅ Database initialization complete!
   🚀 VacciLink Server running at http://localhost:3000
   📊 Connected to MongoDB: mongodb://localhost:27017/Vaccilink
   ```

## 📊 Database Schema

### Parent Schema
```javascript
{
  parentName: String,
  email: String (indexed),
  password: String,
  phone: String (indexed),
  address: String,
  city: String,
  pincode: String,
  childName: String,
  childDOB: String,
  motherDOB: String,
  hospital: String,
  parentAadhar: String,
  qrSecret: String,
  childID: String (indexed),
  vaccinationHistory: [{...}]
}
```

### Appointment Schema
```javascript
{
  childName: String,
  childID: String (indexed),
  parentPhone: String,
  vaccineName: String,
  doseNumber: Number,
  appointmentDate: Date (indexed),
  appointmentTime: String,
  hospital: String,
  hospitalAddress: String,
  centerId: String (indexed),
  status: String,
  type: String
}
```

### Center Schema
```javascript
{
  centerId: String (unique, indexed),
  name: String,
  address: String,
  pincode: String,
  city: String
}
```

### Notification Schema
```javascript
{
  childID: String (indexed),
  childName: String,
  vaccineName: String,
  doseNumber: Number,
  centerId: String,
  hospitalName: String,
  eventDate: Date,
  message: String,
  type: String,
  date: Date,
  read: Boolean
}
```

### Vaccinator Schema
```javascript
{
  fullName: String,
  email: String (indexed),
  phone: String,
  password: String,
  vaccinatorID: String (indexed),
  designation: String,
  centerId: String
}
```

## 🔧 Configuration

- **Port**: 3000
- **MongoDB URI**: `mongodb://localhost:27017/Vaccilink`
- **Connection Retry**: Automatic retry every 5 seconds on failure
- **Index Creation**: Automatic on server startup

## 📝 Key Features

✅ Automatic database initialization on startup  
✅ Comprehensive error handling and logging  
✅ Index creation for optimal query performance  
✅ Connection retry logic with exponential backoff  
✅ All 5 collections pre-configured with proper schemas  
✅ Ready for production use  

## 🐛 Troubleshooting

### MongoDB Connection Failed
- **Solution**: Ensure MongoDB is installed and running on your system
- **Check**: `mongosh` or `mongo` command in terminal

### Port 3000 Already in Use
- **Solution**: Kill the process or use a different port by modifying `PORT` variable in server.js

### Collection Indexes Already Exist
- **Solution**: No action needed - MongoDB handles duplicate index creation gracefully

## 📞 Support

For more information about MongoDB, visit: https://docs.mongodb.com/
For Node.js Mongoose documentation: https://mongoosejs.com/docs/

---
**Last Updated**: April 2026
**Status**: ✅ Production Ready
