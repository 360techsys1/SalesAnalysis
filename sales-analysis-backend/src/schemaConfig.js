// High-level schema description for the LLM.
// Extend this when you add new tables/views.

export const schemaDescription = `
You are connected to a SQL Server database named db_ab7671_ecommerce.
Focus on sales, orders, products, stores, branches, cities, areas, couriers and statuses.

Key views:
- [dbo].[AllOrderReport]: joined view of orders (OrderReportCache), branches, cities, couriers, stores, areas.
  Useful columns: Id, Branch_Name, City_Name, Area_Name, Store_Name, COD_Amount,
  Customer_Name, Customer_Number, Order_Date, Payment_Type, LatestStatus, Tab_Name, ProductDetails, CreatedDateTime.

Key tables:
- [dbo].[OrderReportCache]: cached/denormalized order data with COD_Amount, LatestStatus, Tab_Name, ProductDetails, Order_Date, Branch_Id, City_Id, Store_Id, Area_Id.
- [dbo].[tbl_OrderMasterHeader]: raw order header with Order_Date, COD_Amount, Latest_Status_Id, Branch_Id, Store_Id, City_Id, Area_Id, Payment_Type, Tracking_Number, CustomerWhatsAppNumber.
- [dbo].[tbl_OrderMasterLineItem]: line items with Transaction_Id, Product_Id, Qty.
- [dbo].[tbl_Product_Master]: product catalog with Name, SKU, Selling_Price, Available_Stock, Branch_Id.
- [dbo].[tbl_store]: stores with Name, Store_Code, City_Id, Address, Status.
- [dbo].[tbl_Branch]: branches with Name, Code, City.
- [dbo].[tbl_City]: cities with Name, Country_Id.
- [dbo].[tbl_Area]: areas with Area_Name, City_Id.
- [dbo].[tbl_CourierMaster]: couriers with Name and charges.

Relationships (simplified):
- AllOrderReport joins OrderReportCache to tbl_Branch, tbl_City, tbl_CourierMaster, tbl_store, tbl_Area.
- tbl_OrderMasterHeader relates to tbl_OrderMasterLineItem via Id = Transaction_Id.
- tbl_OrderMasterLineItem.Product_Id -> tbl_Product_Master.Id.
- tbl_OrderMasterHeader.Branch_Id -> tbl_Branch.Id.
- tbl_OrderMasterHeader.Store_Id -> tbl_store.Id.
- tbl_OrderMasterHeader.City_Id -> tbl_City.Id.
- tbl_OrderMasterHeader.Area_Id -> tbl_Area.Id.

Conventions:
- Dates are usually in columns named Order_Date, CreatedDateTime, RefreshDate, Invoice_datetime.
- Monetary amounts are usually in COD_Amount, Total, ReserveAmount, DeliveryCharges, ReturnedCharges, etc.
`;


