const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { dynamodb, TABLE_NAME } = require("../models/todo");

// GET all incomplete todos
router.get("/", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    FilterExpression: "is_complete = :val",
    ExpressionAttributeValues: {
      ":val": false
    }
  };

  try {
    const data = await dynamodb.scan(params).promise();
    res.send(data.Items);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch todos" });
  }
});

// GET todo by ID
router.get("/:id", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      id: req.params.id
    }
  };

  try {
    const data = await dynamodb.get(params).promise();
    if (!data.Item) return res.status(404).send({ error: "Not found" });
    res.send(data.Item);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch todo" });
  }
});

// CREATE new todo
router.post("/", async (req, res) => {
  const todo = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description,
    is_complete: req.body.is_complete || false,
    due_date: req.body.due_date || new Date().toISOString()
  };

  const params = {
    TableName: TABLE_NAME,
    Item: todo
  };

  try {
    await dynamodb.put(params).promise();
    res.send(todo);
  } catch (err) {
    res.status(500).send({ error: "Failed to create todo" });
  }
});

// UPDATE todo
router.patch("/:id", async (req, res) => {
  const { title, description, is_complete, due_date } = req.body;

  const updateExpressions = [];
  const expressionAttributeValues = {};

  if (title !== undefined) {
    updateExpressions.push("title = :title");
    expressionAttributeValues[":title"] = title;
  }
  if (description !== undefined) {
    updateExpressions.push("description = :description");
    expressionAttributeValues[":description"] = description;
  }
  if (is_complete !== undefined) {
    updateExpressions.push("is_complete = :is_complete");
    expressionAttributeValues[":is_complete"] = is_complete;
  }
  if (due_date !== undefined) {
    updateExpressions.push("due_date = :due_date");
    expressionAttributeValues[":due_date"] = due_date;
  }

  const params = {
    TableName: TABLE_NAME,
    Key: { id: req.params.id },
    UpdateExpression: "set " + updateExpressions.join(", "),
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: "ALL_NEW"
  };

  try {
    const result = await dynamodb.update(params).promise();
    res.send(result.Attributes);
  } catch (err) {
    res.status(500).send({ error: "Failed to update todo" });
  }
});

// DELETE todo
router.delete("/:id", async (req, res) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { id: req.params.id }
  };

  try {
    await dynamodb.delete(params).promise();
    res.status(204).send();
  } catch (err) {
    res.status(500).send({ error: "Failed to delete todo" });
  }
});

module.exports = router;
