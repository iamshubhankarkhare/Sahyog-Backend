const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const HttpError = require("../models/http-error");
const User = require("../models/user");
const HomeOwner = require("../models/homeowner");
const Volunteer = require("../models/volunteer");
const NGOOwner = require("../models/ngohead");
const Item = require("../models/donationItem");
const mongoose = require("mongoose");

const getUsers = async (req, res, next) => {
  let users;
  try {
    users = await HomeOwner.find({});
  } catch (err) {
    const error = new HttpError(
      "Fetching users failed, please try again later.",
      500
    );

    return next(error);
  }
  res.json({ users: users.map((user) => user.toObject({ getters: true })) });
};

const activeDonationRequest = async (req, res, next) => {
  let items;
  try {
    items = await Item.find({});
  } catch (err) {
    const error = new HttpError(
      "Fetching users failed, please try again later.",
      500
    );
    return next(error);
  }

  let filtered = [];
  items.forEach((x) => {
    if (x.status == "active") filtered.push(x);
  });
  res.json(filtered);
};
const acceptDonationRequest = async (req, res, next) => {
  const { itemId, VolunteerId } = req.body;
  let existingItem;
  try {
    existingItem = await Item.findById(itemId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, please try again later.",
      500
    );
    return next(error);
  }
  existingItem.status = "pending";
  try {
    await existingItem.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update item status.",
      500
    );
    return next(error);
  }
  res.status(201).json({ item: existingItem });
};
const completeDonationRequest = async (req, res, next) => {
  const { itemId, VolunteerId } = req.body;
  let existingItem;
  try {
    existingItem = await Item.findById(itemId);
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, please try again later.",
      500
    );
    return next(error);
  }
  existingItem.status = "completed";
  try {
    await existingItem.save();
  } catch (err) {
    const error = new HttpError(
      "Something went wrong, could not update item status.",
      500
    );
    return next(error);
  }
  res.status(201).json({ item: existingItem });
};

const signup = async (req, res, next) => {
  const {
    email,
    firstName,
    lastName,
    password,
    nameNGO,
    descriptionNGO,
    date,
    type,
  } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422)
    );
  }

  let existingUser;
  let check;
  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  if (existingUser) {
    const error = new HttpError(
      "User exists already, please login instead.",
      422
    );
    return next(error);
  }

  let hashedPassword;
  try {
    hashedPassword = await bcrypt.hash(password, 12);
  } catch (err) {
    const error = new HttpError(
      "Could not create user, please try again.",
      500
    );
    return next(error);
  }
  if (type == "volunteer") {
    try {
      check = await NGOOwner.findOne({ nameNGO: nameNGO });
    } catch (err) {
      const error = new HttpError(
        "Signing up failed, please try again later.",
        500
      );
      return next(error);
    }
    if (!check) {
      const error = new HttpError("No Such NGO Exists.", 422);
      return next(error);
    }
  }
  var fname = firstName;
  var middle = " ";
  var lname = lastName;
  var name = fname.concat(middle, lname);
  const createdUser = new User({
    email,
    password: hashedPassword,
    type,
    date,
  });
  var createdUser2;
  if (type == "homeowner") {
    createdUser2 = new HomeOwner({
      email,
      name,
      image: req.file.path,
    });
  } else if (type == "head") {
    createdUser2 = new NGOOwner({
      email,
      name,
      image: req.file.path,
      nameNGO,
      descriptionNGO: descriptionNGO,
    });
  } else if (type == "volunteer") {
    const url = req.file.path;
    createdUser2 = new Volunteer({
      image: url,
      email: email,
      name: name,
      nameNGO: nameNGO,
      headNGO: check.id,
    });
  } else {
  }
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdUser.save({ session: sess });
    await createdUser2.save({ session: sess });
    if (check) {
      await check.volunteers.push(createdUser2);
      await check.save({ session: sess });
    }
    await sess.commitTransaction();
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: createdUser.id, email: createdUser.email },
      "supersecret_dont_share",
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Signing up failed, please try again later.",
      500
    );
    return next(error);
  }

  res.status(201).json({
    userId: createdUser.id,
    email: createdUser.email,
    token: token,
    type: createdUser.type,
  });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  let existingUser;

  try {
    existingUser = await User.findOne({ email: email });
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }

  if (!existingUser) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  let isValidPassword = false;
  try {
    isValidPassword = await bcrypt.compare(password, existingUser.password);
  } catch (err) {
    const error = new HttpError(
      "Could not log you in, please check your credentials and try again.",
      500
    );
    return next(error);
  }

  if (!isValidPassword) {
    const error = new HttpError(
      "Invalid credentials, could not log you in.",
      403
    );
    return next(error);
  }

  let token;
  try {
    token = jwt.sign(
      { userId: existingUser.id, email: existingUser.email },
      "supersecret_dont_share",
      { expiresIn: "1h" }
    );
  } catch (err) {
    const error = new HttpError(
      "Logging in failed, please try again later.",
      500
    );
    return next(error);
  }
  res.json({
    userId: existingUser.id,
    email: existingUser.email,
    token: token,
    type: existingUser.type,
  });
};

exports.getUsers = getUsers;
exports.signup = signup;
exports.login = login;
exports.activeDonationRequest = activeDonationRequest;
