# PantryPal Backend (`pp-backend`) — Codebase Report

**Group #3 | PROG8950 Capstone | Conestoga College (Winter 2026)**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript) |
| Framework | Express.js wrapped with `@vendia/serverless-express` |
| Database | PostgreSQL (Amazon RDS) |
| ORM | Prisma Client v6 |
| Authentication | AWS Cognito (JWT Validation Middleware) |
| Infrastructure as Code | Terraform (v1.5+) |
| Storage | Amazon S3 (Pantry Uploads & AI Image Cache) |
| External APIs | Spoonacular API (Recipes), Unsplash/Pexels API (Images) |
| AI / LLM | AWS Bedrock (`amazon.nova-lite-v1:0`, `amazon.titan-image-generator-v1`) via AWS SDK v3 |

---

## Architecture Diagram

```mermaid
graph TD
    subgraph Frontend["PantryPal V3 (React/Vite)"]
        UI[React UI Components]
        Redux[Redux Store]
    end

    subgraph AWS_Gateway["AWS API Gateway"]
        API_Route["/api/*"]
    end

    subgraph AWS_Cognito["AWS Cognito"]
        AuthPool[(User Pool)]
    end

    subgraph AWS_Lambda["Lambda: pp-backend-api"]
        App[Express Router]
        
        Auth[Auth Middleware]
        PantryMod[Pantry Module]
        RecipeMod[Recipes Module]
        MealMod[Meal Plan Module]
        OnboardMod[Onboarding Module]
        UserMod[Users Module]
    end

    subgraph AWS_RDS["AWS RDS (PostgreSQL)"]
        DB[(Prisma Postgres DB)]
    end

    subgraph AWS_S3["Amazon S3"]
        PantryBucket[(Pantry Uploads)]
        RecipeBucket[(AI Recipe Cache)]
    end

    subgraph External["External Services"]
        Bedrock["AWS Bedrock\n(Nova Lite & Titan)"]
        Spoon["Spoonacular API"]
        Unsplash["Unsplash API"]
    end

    %% Flow
    UI --> Redux
    Redux -->|HTTP Requests| AWS_Gateway
    AWS_Gateway -->|Cognito Authorizer| AWS_Cognito
    AWS_Gateway -->|Proxy Integration| App
    
    App --> Auth
    Auth --> PantryMod & RecipeMod & MealMod & OnboardMod & UserMod
    
    PantryMod & RecipeMod & MealMod & OnboardMod & UserMod -->|Prisma Query| DB
    
    PantryMod -.->|Presigned URLs| PantryBucket
    RecipeMod -.->|Upload generated images| RecipeBucket
    
    RecipeMod -->|Prompt| Bedrock
    RecipeMod -->|Search| Spoon
    RecipeMod -->|Fetch| Unsplash
```

---

## Sequence Charts

### 1. User Authentication & Profile Lookup

```mermaid
sequenceDiagram
    actor User
    participant App as React Frontend
    participant Cognito as AWS Cognito
    participant Gateway as API Gateway
    participant Lambda as Backend Lambda
    participant DB as RDS PostgreSQL

    User->>App: Login
    App->>Cognito: Authenticate User
    Cognito-->>App: Return JWT Tokens
    
    App->>Gateway: GET /api/users/me (Bearer Token)
    Gateway->>Lambda: Proxy Event
    Lambda->>Lambda: AuthMiddleware (Verify JWT)
    Lambda->>DB: findUnique({ where: { subject: token.sub } })
    
    alt User exists
        DB-->>Lambda: User Profile
    else User is new
        Lambda->>DB: create({ data: { subject, ... } })
        DB-->>Lambda: New User Profile
    end
    
    Lambda-->>Gateway: 200 OK (User Profile)
    Gateway-->>App: 200 OK
```

### 2. AI Recipe & Image Generation (Async Flow)

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as recipes.router.ts
    participant Service as recipe-generate-list.service.ts
    participant Bedrock as AWS Bedrock
    participant S3 as Amazon S3

    User->>Client: Click "Generate Recipes"
    Client->>Route: POST /api/recipes/generate-list { ingredients }
    Route->>Service: generateAiRecipeList()
    Service->>Bedrock: ConverseCommand (Nova Lite)
    Bedrock-->>Service: JSON Recipe List
    Service-->>Route: Parsed Recipes
    Route-->>Client: 200 OK { recipes }
    
    Client-->>User: Display Text Recipes instantly (Shimmering Image Loader)
    
    loop For each Recipe
        Client->>Route: POST /api/recipes/generate-image { title, description }
        Route->>Bedrock: InvokeModelCommand (Titan Image Generator)
        Bedrock-->>Route: Base64 Image
        Route->>S3: PutObjectCommand (Upload to Recipe Cache)
        S3-->>Route: S3 Object URL
        Route-->>Client: 200 OK { imageUrl }
        Client-->>User: Render fully generated Image
    end
```

### 3. Add AI Recipe to Meal Plan

```mermaid
sequenceDiagram
    actor User
    participant Client as React Frontend
    participant Route as meal-plan.router.ts
    participant Service as meal-plan.service.ts
    participant DB as RDS PostgreSQL

    User->>Client: Click "Add to Meal Plan" on AI Recipe
    Client->>Route: POST /api/meal-plan/ai { AiRecipe }
    Route->>Service: saveAiRecipeToMealPlan(userId, aiRecipe)
    
    Service->>DB: findFirst({ where: { title: aiRecipe.title } })
    
    alt Recipe not in DB
        Service->>DB: create({ data: { id: 1500000000+, ...aiRecipe } })
        DB-->>Service: Persistent Recipe ID
    end
    
    Service->>DB: create({ data: { MealPlanItem } })
    DB-->>Service: Created MealPlanItem
    
    Service-->>Route: Success
    Route-->>Client: 200 OK
```
