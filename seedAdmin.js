require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const existing = await User.findOne({ email: 'admin@rewear.com' });
  if (existing) {
    console.log('⚠️  Admin already exists — skipping');
    process.exit(0);
  }

  await User.create({
    name:     'ReWear Admin',
    email:    'admin@rewear.com',
    password: 'Admin@1234',
    role:     'admin',
  });

  console.log('✅ Admin account created!');
  console.log('   Email:    admin@rewear.com');
  console.log('   Password: Admin@1234');
  console.log('   → Change these after first login!');
  process.exit(0);
}).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
