const express = require("express");
const cors = require('cors');
const mongoose = require("mongoose");
const helmet = require('helmet');  // NEW
const port = 3001;
const routes = require("./routes");

main().catch((err) => console.log(err));

async function main() {
  await mongoose.connect("mongodb://mongo:27017/todos", {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  });

  const app = express();

  // 🔐 Secure HTTP headers
  app.use(helmet());

  // 🛑 Disable fingerprinting via headers
  app.disable('x-powered-by');

  // 🎯 Restrict CORS to specific origin
  const corsOptions = {
    origin: 'http://localhost:3000', // replace with frontend domain in production
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));

  app.use(express.json());
  app.use("/api", routes);

  app.listen(port, () => {
    console.log(`Server is listening on port: ${port}`);
  });
}
