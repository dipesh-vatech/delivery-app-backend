const express = require("express");
const { google } = require("googleapis");
const app = express();

app.use(express.json()); // For parsing JSON requests

// Load your Google Service Account credentials
const credentials = require("./milk-delivery-app-key.json");
const SHEET_ID = "1LPv0JUmcE8xyMlNzDM1OWia-9CvtsCIEMba3Lk5Yvwg"; // Replace with your actual Google Sheet ID

app.get("/", (req, res) => {
  res.send("Welcome to the Temporary Signing Service!"); // Response for the homepage
});

// Generate an OAuth2 Access Token
app.post("/get-access-token", async (req, res) => {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const accessToken = await auth.getAccessToken();
    res.status(200).json({ accessToken });
  } catch (error) {
    console.error("Error generating access token:", error);
    res.status(500).json({ error: "Failed to generate access token" });
  }
});

// Sync Delivery Data to Google Sheets
app.post("/sync-delivery", async (req, res) => {
  const { deliveryData } = req.body;

  if (!deliveryData) {
    res.status(400).send({ error: "Delivery data is required." });
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Add headers to the sheet if they don’t already exist
    const headers = ["CustomerID","Customer Name", "Date", "Milk Type", "Quantity", "Milk Rate", "Milk Total"];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, // Replace with your sheet ID
      range: "Sheet1!A1:G1", // The range for headers (adjust columns if needed)
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });

    // Add the delivery data below the headers
    const values = [
      [
        deliveryData.customerID,
        deliveryData.customerName,
        deliveryData.date,
        deliveryData.milkType,
        deliveryData.quantity,
        deliveryData.milkRate,
        deliveryData.milkTotal,
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: "Sheet1!A2:G", // Start appending data from the second row
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });

    res.status(200).send({ message: "Delivery synced successfully with headers!" });
  } catch (error) {
    console.error("Error syncing delivery:", error);
    res.status(500).send({ error: "Failed to sync delivery to Google Sheets" });
  }
});

app.post("/fetch-summaries", async (req, res) => {
  const { month, year, selectedCustomerId } = req.body;

  if (!month || !year) {
    res.status(400).send({ error: "Month and year are required." });
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Fetch data from Google Sheets
    const range = `Sheet1!A2:G`; // Adjust range as needed
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = response.data.values || [];
    console.log("Raw Rows from Google Sheets:", rows);

    // Filter rows based on the month, year, and selected customer
    const filteredRows = rows.filter((row) => {
      const customerID = row[0]; // CustomerID is in the 1st column
      const date = row[2]; // Date is in the 3rd column
      const deliveryDate = new Date(date);

      if (isNaN(deliveryDate)) {
        console.warn("Invalid Date Format:", date);
        return false;
      }

      // Include all rows if no customer is selected, or match specific customer
      const includeRow =
        (!selectedCustomerId || parseInt(customerID) === parseInt(selectedCustomerId)) &&
        deliveryDate.getMonth() + 1 === parseInt(month) &&
        deliveryDate.getFullYear() === parseInt(year);

      console.log("Row:", row, "Include Row?", includeRow);
      return includeRow;
    });

    console.log("Filtered Rows:", filteredRows);

    if (filteredRows.length === 0) {
      console.warn("No rows matched the filter for month:", month, "year:", year);
    }

    res.status(200).send({ deliveries: filteredRows });
  } catch (error) {
    console.error("Error fetching summaries:", error);
    res.status(500).send({ error: "Failed to fetch summaries from Google Sheets." });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Temporary Signing Service running on port ${PORT}`));
