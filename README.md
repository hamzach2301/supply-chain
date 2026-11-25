# Delivery Time Prediction and Analytics Platform

This is a local full-stack Node.js application. It generates 900 realistic synthetic shipment records when the server starts, fits a Ridge regression model, and exposes the model through API endpoints used by the browser interface.

## Run it

1. Double-click `run-platform.bat`, or open PowerShell in this folder and run `node server.js`.
2. Open `http://localhost:3030`.

No packages or internet connection are required.

## Model integrity

The 80/20 split uses a deterministic hash of shipment ID only. The training subset alone defines category levels and numeric scaling values; the held-out test subset is used only for MAE, RMSE, and R². The model excludes actual delivery duration from all input features.

The current dataset is synthetic by design, generated from route distance, mode, load, cost, and infrastructure conditions. The relationships are deliberately plausible but are not claims about a real carrier or geography.
