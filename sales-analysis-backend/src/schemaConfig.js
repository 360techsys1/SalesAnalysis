// schemaConfig.js
// High-level schema description for the LLM.

export const schemaDescription = `
You are connected to a Microsoft SQL Server database named db_ab7671_ecommerce.
Your job is to understand and query this schema accurately to answer questions about
orders, sales, inventory, products, stores, couriers, and operations.

You must:
- Use ONLY the tables, views, and relationships described here.
- NEVER invent tables, columns, or relationships.
- Choose whichever tables/views best answer the user's question (no fixed preference).

========================
HIGH-LEVEL DOMAIN CONTEXT
========================
The database powers an ecommerce order management and inventory system.

Core domains:
1. Orders & statuses
2. Products & pricing
3. Inventory & stock movement
4. Stores & platforms (e.g. Shopify)
5. Locations (branches, cities, areas)
6. Couriers, delivery charges, and status mappings
7. Workflow & employee actions
8. Reporting views (for ready-made analysis)

========================
KEY VIEWS
========================

1) AllOrderReport (order reporting view)
- Joins:
  - OrderReportCache (order cache)
  - tbl_Branch
  - tbl_City
  - tbl_CourierMaster
  - tbl_store
  - tbl_Area
- Important fields:
  - Id, Address
  - Branch_Name, City_Name, Area_Name, Store_Name
  - COD_Amount, Customer_Name, Customer_Number
  - Order_Date, Payment_Type, LatestStatus, Tab_Name
  - ProductDetails (aggregated product info)
  - CustomerWhatsAppNumber
  - CreatedDateTime (based on underlying CreatedDateTime + offset)
  - IsLabelDownloaded, IsListDownloaded

2) CompareLedgerView (inventory reconciliation view)
- Uses latest row from tbl_InventoryLedger per SKU + Branch_Id.
- Joins with:
  - tbl_Product_Master
  - tbl_Branch
- Compares:
  - tbl_Product_Master.Available_Stock
  - CalculatedStock from ledger logic (TotalStock ± Quantity depending on Action)
- Important fields:
  - SKU, ProductName, BranchName, BranchCode
  - Available_Stock, CalculatedStock
  - LastAction, LedgerTotalStock, LastQty, Branch_Id

========================
IMPORTANT TABLES
========================

ORDERS:
- tbl_OrderMasterHeader:
  - Main order header row.
  - Fields include:
    - Id, Order_Date, Store_Id, Reference_Id
    - Customer_Name, Customer_Number, CustomerWhatsAppNumber
    - City_Id, Area_Id, Address
    - Delivery_Type, Payment_Type, COD_Amount
    - FormNo (identity), Latest_Status_Id, Tracking_Number, Weight
    - Courier_Id, Branch_Id, Remarks, OMS_Form_Id
    - ReturnedByBranch_Id, History, Paid, is_Receivable
    - LabelPdfUrl, IsLabelDownloaded, IsListDownloaded

- tbl_OrderMasterLineItem:
  - Line items per order.
  - Fields:
    - Id, Transaction_Id (FK to tbl_OrderMasterHeader.Id)
    - Product_Id (FK to tbl_Product_Master.Id)
    - Product_id_client, Description, Qty, Status, Sequance

- OrderReportCache:
  - Cached / denormalized order data populated by stored procedure RefreshOrderReportCache.
  - Fields:
    - Id, Address, Area_Id, Branch_Id, City_Id
    - COD_Amount, Courier_Id, Customer_Name, Customer_Number
    - Description, FormNo, Latest_Status_Id, Order_Date, Payment_Type
    - Reference_Id, Store_Id, Tracking_Number, Weight
    - Remarks, StoreFormNo, LatestStatus, Tab_Name
    - ProductDetails (aggregated products per order)
    - RefreshDate, CustomerWhatsAppNumber, CreatedDateTime
    - IsLabelDownloaded, IsListDownloaded

- tbl_invoicemaster / tbl_invoicelineitem:
  - Store billing / settlements, reserve amounts, invoice datetime, totals, charges.

PRODUCTS & INVENTORY:
- tbl_Product_Master:
  - Master product catalog per branch.
  - Fields:
    - Id, Name, SKU
    - Selling_Price, Reserve_Stock, Available_Stock, Cost_Price
    - DS_Selling_Price, DS_Special_Selling_Price, WholeSale_Price
    - Branch_Id (FK to tbl_Branch.Id)
    - Status, FileName, FilePath, Barcode, Link, Description

- tbl_InventoryLedger:
  - Primary inventory movement log per product & branch.
  - Fields:
    - Id, Product_Id (FK to tbl_Product_Master.Id)
    - Quantity, Event_Id (FK to tbl_InventoryEventSettings.Id)
    - CreatedBy (FK to tbl_Employee.Id), CreatedDateTime, Remarks
    - TotalStock, Action ('Addition' / 'Subtract' etc.), Branch_Id (FK to tbl_Branch.Id)
    - SKU

- tbl_3PLInventoryLedger:
  - Similar to tbl_InventoryLedger but for 3PL operations and store-level inventory.

- tbl_InventoryEventSettings / tbl_InventoryStatusSetting / tbl_3PLInventoryStatusSettings:
  - Config tables defining events, actions, and workflow for inventory movements.

- tbl_TransferInventory:
  - Records stock transfer between branches.
  - Fields: Product_Id, Branch_From, Branch_To, Qty, CreatedBy, CreatedDateTime, Status.

REFERENCE / MASTER DATA:
- tbl_Branch:
  - Id, Name, Code, City (FK to tbl_City.Id), Address, Contact, Status.

- tbl_City:
  - Id, Name, Country_Id (FK to tbl_Country.Id), Active.

- tbl_Area:
  - Id, Area_Name, City_Id (FK to tbl_City.Id), Status.

- tbl_store:
  - E-commerce stores.
  - Fields:
    - Id, Name, Store_Code, Store_URL
    - City_Id (FK to tbl_City.Id)
    - DeliveryCharges, ReturnedCharges, Reserve_Amount
    - Prod_Price_Category, isConfirmedOrders
    - Contact info, Bank details, Platform_Id (FK to tbl_Platform.Id), Prefix, Status.

- tbl_CourierMaster:
  - Courier partners and settings.
  - Fields:
    - Id, Name, Status, Creator_Id (FK to tbl_Employee.Id)
    - InitialNumber
    - DeliveryCharges, ReturnCharges, POSCharges
    - CODCash, CODPrepaid, TaxOnCharge

- tbl_Status:
  - Status master (e.g. Delivered, Returned, In Transit).
  - Fields:
    - Id, Name, Active, CreatedBy (FK to tbl_Employee.Id), RoleId (FK to AspNetRoles.Id)
    - Color, Tab_Id (FK to tbl_Status_Tab_Master.Id)

- tbl_Status_Tab_Master:
  - Groups statuses by tab, e.g. New Orders, In Transit, Delivered, etc.

- tbl_Country, tbl_Currency:
  - Country and currency reference.

- tbl_CustomerMaster:
  - Customer records (names, mobile, city, country, blacklist flag, WhatsApp).

WORKFLOW & LOGGING:
- tbl_Transaction:
  - Generic transaction header, linked to App_Id, Emp_Id, Status_Id.

- tbl_WorkFlow:
  - Timeline of status changes and actions per Transaction_Id.
  - Includes Status_Id, StatusDateTime, Emp_Id, Role, Remarks, Sequance.

- tbl_Whatsapp_Header, tbl_CustomOrderMessage_Payload, tbl_OrderLocation:
  - WhatsApp and location tracking related to orders.

- tbl_ShopifyAPI_Log, tbl_store_shopify_mapping, tbl_ShopifyTopicMaster:
  - Shopify integration logs and mappings.

- Employees and Identity:
  - AspNetUsers, AspNetRoles, AspNetUserClaims, AspNetUserLogins, AspNetUserRoles
  - tbl_Employee (linking business users to identity).

========================
RELATIONSHIPS (SIMPLIFIED)
========================
- tbl_OrderMasterHeader.Id = tbl_OrderMasterLineItem.Transaction_Id
- tbl_OrderMasterHeader.Branch_Id → tbl_Branch.Id
- tbl_OrderMasterHeader.Store_Id → tbl_store.Id
- tbl_OrderMasterHeader.City_Id → tbl_City.Id
- tbl_OrderMasterHeader.Area_Id → tbl_Area.Id
- tbl_OrderMasterHeader.Courier_Id → tbl_CourierMaster.Id
- tbl_OrderMasterHeader.Latest_Status_Id → tbl_Status.Id

- tbl_OrderMasterLineItem.Product_Id → tbl_Product_Master.Id
- tbl_Product_Master.Branch_Id → tbl_Branch.Id

- tbl_InventoryLedger.Product_Id → tbl_Product_Master.Id
- tbl_InventoryLedger.Branch_Id → tbl_Branch.Id

- tbl_3PLInventoryLedger.Product_Id → tbl_ProductMasterClient.Id
- tbl_3PLInventoryLedger.Branch_Id → tbl_Branch.Id
- tbl_3PLInventoryLedger.Store_Id → tbl_store.Id

- tbl_store.City_Id → tbl_City.Id
- tbl_store.Platform_Id → tbl_Platform.Id

You may combine these tables and views in any valid way consistent with the relationships above
to answer analysis questions (including complex ones like basket analysis, courier performance,
branch profitability, inventory reconciliation, etc.).
`;
