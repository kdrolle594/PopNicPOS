# PopNicPOS User Flows

This document outlines the typical workflow for each user role in the PopNicPOS system.

---

## 1. Customer Flow

**Access Level:** Browse menu, place orders, track deliveries

```mermaid
graph TD
    A[Customer Visits Site] --> B[Login/Register with Auth0]
    B --> C{Already Logged In?}
    C -->|Yes| D[View Customer View]
    C -->|No| B
    D --> E[Browse Menu Items]
    E --> F[View Item Details]
    F --> G{Add to Cart?}
    G -->|No| E
    G -->|Yes| H[Add Item Quantity]
    H --> I{Continue Shopping?}
    I -->|Yes| E
    I -->|No| J[View Cart]
    J --> K{Ready to Order?}
    K -->|No| J
    K -->|Yes| L[Enter Delivery Address]
    L --> M[Review Order Total]
    M --> N{Confirm Order?}
    N -->|No| J
    N -->|Yes| O[Submit Order]
    O --> P[Order Confirmation]
    P --> Q[View Order Status & Tracking]
    Q --> R{Order Completed?}
    R -->|No| Q
    R -->|Yes| S[Order Complete]
    S --> T[Leave Review/Feedback]
```

---

## 2. Cashier Flow

**Access Level:** Create orders, view kitchen display, manage in-store transactions

```mermaid
graph TD
    A[Cashier Starts Shift] --> B[Login to POS Terminal]
    B --> C[View Dashboard]
    C --> D{Task?}
    D -->|Create Order| E[Enter Customer Info]
    E --> F[Browse Menu Items]
    F --> G[Add Items to Order]
    G --> H{More Items?}
    H -->|Yes| F
    H -->|No| I[Apply Discounts if Applicable]
    I --> J[Calculate Total]
    J --> K[Process Payment]
    K --> L[Generate Receipt]
    L --> M[Submit Order to Kitchen]
    D -->|Check Kitchen Display| N[View Kitchen Display]
    N --> O[Monitor Order Status]
    O --> P{Order Ready?}
    P -->|No| O
    P -->|Yes| Q[Notify Customer]
    D -->|End Shift| R[Logout]
```

---

## 3. Kitchen Flow

**Access Level:** View orders, update order status, manage preparation

```mermaid
graph TD
    A[Kitchen Staff Starts Shift] --> B[Login to Kitchen Display]
    B --> C[View Active Orders Queue]
    C --> D{New Order Received?}
    D -->|Yes| E[Order Appears in Queue]
    E --> F[Read Order Details]
    F --> G[Review Items & Special Instructions]
    G --> H[Start Preparation]
    H --> I[Update Order Status to 'Preparing']
    I --> J{All Items Ready?}
    J -->|No| J
    J -->|Yes| K[Update Order Status to 'Ready']
    K --> L[Alert Cashier/Customer]
    L --> M{More Orders?}
    M -->|Yes| C
    M -->|No| N[End Shift]
    N --> O[Logout]
```

---

## 4. Manager Flow

**Access Level:** Full POS access + inventory & menu management + user admin

```mermaid
graph TD
    A[Manager Logins] --> B[View Dashboard]
    B --> C{Task?}
    C -->|Manage Menu| D[View Menu Items List]
    D --> E{Action?}
    E -->|Add Item| F[Create New Menu Item]
    E -->|Edit Item| G[Update Existing Item]
    E -->|Remove Item| H[Delete Menu Item]
    E -->|Back| C
    C -->|Manage Inventory| I[View Inventory Items]
    I --> J{Action?}
    J -->|View Stock| K[Check Item Quantities]
    J -->|Reorder| L[Create Restock Order]
    J -->|Adjust Stock| M[Update Quantity On Hand]
    J -->|Back| C
    C -->|View Reports| N[Generate Sales Reports]
    N --> O[Analyze Order Data]
    O --> P[View Revenue Metrics]
    P --> C
    C -->|Manage Users| Q[View Employee List]
    Q --> R{Action?}
    R -->|Add Employee| S[Create New User]
    R -->|Edit Employee| T[Update User Info/Role]
    R -->|Remove Employee| U[Deactivate User]
    R -->|Back| C
    C -->|View Orders| V[Monitor All Orders]
    V --> W[Filter by Status/Date]
    W --> C
    C -->|Logout| X[End Session]
```

---

## 5. Driver Flow

**Access Level:** View assigned deliveries, broadcast GPS, track delivery status

```mermaid
graph TD
    A[Driver Starts Shift] --> B[Login to Driver Portal]
    B --> C[View Available Deliveries]
    C --> D[Filter by Location/Distance]
    D --> E{Select Delivery?}
    E -->|No| C
    E -->|Yes| F[Accept Delivery Order]
    F --> G[View Customer Address & Details]
    G --> H[Navigate to Pickup Location]
    H --> I[Confirm Pickup]
    I --> J[Update Status to 'In Progress']
    J --> K[Enable GPS Tracking]
    K --> L[Navigate to Delivery Address]
    L --> M{Arrived at Destination?}
    M -->|No| L
    M -->|Yes| N[Confirm Arrival]
    N --> O[Deliver Items to Customer]
    O --> P[Get Delivery Confirmation/Signature]
    P --> Q[Update Status to 'Delivered']
    Q --> R[End GPS Tracking]
    R --> S{More Deliveries?}
    S -->|Yes| C
    S -->|No| T[End Shift]
    T --> U[Logout]
```

---

## 6. Administrator Flow

**Access Level:** Full system access, user management, analytics, system configuration

```mermaid
graph TD
    A[Admin Logins] --> B[View Admin Dashboard]
    B --> C{Task?}
    C -->|Manage All Users| D[View User Directory]
    D --> E{Action?}
    E -->|Create Account| F[Register New User/Employee]
    E -->|Edit Details| G[Modify User Info]
    E -->|Assign Role| H[Set User Role & Permissions]
    E -->|Deactivate| I[Disable User Account]
    E -->|Back| C
    C -->|View System Analytics| J[Access Analytics Dashboard]
    J --> K[View Revenue Reports]
    K --> L[Check Order Volume Trends]
    L --> M[Analyze Driver Performance]
    M --> N[Review Customer Metrics]
    N --> C
    C -->|System Configuration| O[Access Settings]
    O --> P{Setting?}
    P -->|Auth Config| Q[Configure Auth0 Settings]
    P -->|Database| R[Manage DB Connections]
    P -->|Email/Notifications| S[Setup Notification Rules]
    P -->|Back| C
    C -->|Audit & Logs| T[View System Logs]
    T --> U[Monitor Failed Logins]
    U --> V[Track API Activity]
    V --> W[Review Transactions]
    W --> C
    C -->|Content Management| X[Manage Menu]
    X --> Y[Manage Categories]
    Y --> C
    C -->|Logout| Z[End Session]
```

---

## Cross-User Order Lifecycle

```mermaid
graph TD
    subgraph Customer["🛒 Customer"]
        C1["Browse & Add Items"]
        C2["Place Order"]
    end
    
    subgraph Cashier["💳 Cashier"]
        C3["Create/Submit Order"]
        C4["Check Status"]
    end
    
    subgraph Kitchen["🍳 Kitchen"]
        K1["Receive Order"]
        K2["Prepare Items"]
        K3["Mark Ready"]
    end
    
    subgraph Driver["🚗 Driver"]
        D1["Accept Delivery"]
        D2["Pick Up Order"]
        D3["Deliver to Customer"]
    end
    
    subgraph Manager["📊 Manager"]
        M1["Monitor Operations"]
        M2["View Metrics"]
    end
    
    C1 --> C2
    C2 --> C3
    C3 --> K1
    K1 --> K2
    K2 --> K3
    K3 --> C4
    K3 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> C4
    K3 --> M1
    D3 --> M1
    M1 --> M2
```

---

## Session Flow: Login & Auth

```mermaid
graph TD
    A[Visit Application] --> B[Check Logged In Status]
    B -->|Not Logged In| C[Redirect to Auth0 Login]
    C --> D[Auth0 Authenticates User]
    D --> E[Redirect to App with Token]
    E --> F[Frontend Stores Access Token]
    F --> G[Call /api/auth/me with JWT]
    G --> H[Backend Validates JWT]
    H --> I[loadUser Middleware Resolves Role]
    I --> J{User Exists?}
    J -->|Yes| K[Load Employee/Customer Profile]
    J -->|No| L[Auto-Create Customer Account]
    K --> M[Return User Data & Role]
    L --> M
    M --> N[Frontend Sets Auth Store]
    N --> O[Determine Allowed Views by Role]
    O --> P[Render Role-Appropriate Dashboard]
    P --> Q{User Action?}
    Q -->|Continue| R[User Navigates Views]
    Q -->|Logout| S[Clear Token & Auth Store]
    S --> C
    R --> Q
```

---

## Error Handling & Recovery

```mermaid
graph TD
    A[User Action] --> B{Request Succeeds?}
    B -->|Yes| C[Update UI & Store]
    C --> D[Display Success Message]
    B -->|No| E{Error Type?}
    E -->|Auth Error 401| F[Token Expired/Invalid]
    F --> G[Redirect to Login]
    E -->|Permission Error 403| H[Show Access Denied]
    H --> I[Suggest Contact Admin]
    E -->|Not Found 404| J[Show Item Not Found]
    J --> K[Return to Previous View]
    E -->|Server Error 500| L[Log Error & Notify User]
    L --> M[Show Retry Option]
    E -->|Network Error| N[Show Offline Message]
    N --> O[Queue Action for Retry]
    O --> P[Attempt Retry Later]
```

---

## Key Takeaways

| Role | Primary Task | Key Views | Main Tools |
|------|-------------|-----------|-----------|
| **Customer** | Browse & order | Customer View, Cart, Tracking | Menu, Map (Leaflet) |
| **Cashier** | Create & process orders | POS Terminal, Kitchen Display | Order entry, Receipt printer |
| **Kitchen** | Prepare food | Kitchen Display, Order Queue | Status updates, Timers |
| **Driver** | Deliver orders | Driver Portal, Map, Delivery List | GPS, Navigation |
| **Manager** | Oversee operations | All views + Menu, Inventory, Users | Reports, Settings |
| **Admin** | System administration | All views + System Config, Logs | Database, Auth, Analytics |

---

## Notes

- All user session flows include **Auth0 authentication** and **JWT token validation**
- Real-time updates via **Socket.io** keep all users synchronized (especially important for kitchen and driver)
- **Role-based access control** ensures users only see views and actions permitted for their role
- **Error handling** gracefully manages auth failures, network issues, and business logic errors
- **Database transactions** ensure order integrity (no partial orders even if system fails mid-creation)
