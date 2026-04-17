# PantryPal V3 — Requirements

## References
- `pantrypal_V1` — monorepo structure and backend architecture **(do not modify)**
- `PantryPal_V2` — feature scope and UI patterns **(do not modify)**

---

## Rule
- V3 follows the **V1 monorepo structure** exactly.
- V3 only implements the **features that exist in V2** — nothing more.
- Features in V1 that are NOT in V2 (community, home/daily-special,  pgvector, etc.) are **excluded**.

---

## 1. Project Structure

Mirrors V1 monorepo layout:

```
PantryPal_V3/
├── apps/
│   ├── api/
│   ├── web/
│   └── workers/
├── packages/
│   ├── shared-types/
│   ├── shared-utils/
│   ├── tsconfig/
│   └── eslint-config/
├── infra/
│   └── aws/sam/
├── package.json        # npm workspaces root
└── tsconfig.json
```

---

## 2. Features in Scope (from V2)

These are the only features V3 implements, derived directly from what V2 has:

| Feature | V2 Source |
|---------|-----------|
| Landing page | `LandingPage.tsx` |
| Login | `LoginView.tsx` — email/password + local auth fallback |
| Signup | `SignupView.tsx` — email/password |
| Onboarding (4-step) | `OnboardingView.tsx` — diet, allergies, taste, goals |
| Dashboard | `DashboardView.tsx` — pantry health / ingredient / planning charts + recent items table |
| Pantry management | `PantryView.tsx` — category sections, expiry progress, add/delete items |
| Receipt/image scan | `ScanView.tsx` — upload image → Bedrock → review extracted items → save to pantry |
| Recipe suggestions | `RecipesView.tsx` — pantry-based Spoonacular results, favorite, add to plan, view details |
| AI recipes | `AiRecipesView.tsx` — Bedrock-generated recipes from pantry, add to plan |
| Meal planner | `MealPlannerView.tsx` — planned meals list + shopping list (have/missing) |
| Favourites | `FavoritesView.tsx` — saved recipes, view details, remove |
| Profile & preferences | `ProfileView.tsx` — user info, edit preferences, re-run questionnaire |

**Not in V2, therefore excluded from V3:**
- Community feed (posts, comments, likes, topics)
- Home page / daily special
- pgvector semantic recommendations
- Summary page
- Edit profile page (separate from ProfileView)

---

## 3. Backend (`apps/api`)

### 3.1 Stack

Mirrors V1 stack:
- Node.js 20, TypeScript, ESM
- Express (local) + AWS Lambda adapter (`lambda.ts`)
- Prisma + PostgreSQL
- AWS Bedrock Nova Lite — image scan + AI recipe generation
- AWS S3 — pantry upload images
- AWS Cognito — JWT auth via JWKS (`jose`)

### 3.2 Module Structure

Mirrors V1 `src/` layout, but only the modules needed for V2 features:

```
src/
├── common/
│   ├── ai/        bedrock.ts
│   ├── auth/      jwt.ts
│   ├── db/        prisma.ts
│   ├── routing/   helpers.ts
│   └── storage/   s3.ts
├── modules/
│   ├── api/       router.ts
│   ├── auth/      middleware (withAuth, verifyCognitoToken)
│   ├── ingredients/ ingredient.service.ts
│   ├── onboarding/  onboarding.router.ts, onboarding.service.ts
│   ├── pantry/    pantry.router.ts, pantry.service.ts, pantry.types.ts
│   ├── recipes/   recipes.router.ts + services (suggestions, search, generate, save)
│   └── users/     users.router.ts, profile.service.ts
├── lambda.ts
└── main.ts
```

Excluded modules (not needed for V2 features): `community/`, `home/`, `planner/` (no backend persistence needed).

### 3.3 API Routes

Only routes consumed by V2 features:

| Method | Path | Feature |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/me/bootstrap` | Cognito token verify + upsert UserProfile |
| GET | `/me/pantry` | Pantry list |
| POST | `/me/pantry` | Add pantry item |
| PATCH | `/me/pantry/:id` | Update pantry item |
| DELETE | `/me/pantry/:id` | Delete pantry item |
| POST | `/me/pantry/upload-url` | S3 presigned URL for image upload |
| POST | `/me/pantry/parse-image` | Bedrock image scan → parsed items |
| POST | `/pantry/items/bulk` | Bulk add scanned items |
| GET | `/me/onboarding` | Load saved preferences |
| POST | `/me/onboarding` | Save onboarding answers |
| GET | `/recipes/suggestions` | Pantry-based recipe suggestions (Spoonacular) |
| GET | `/recipes/search` | Recipe title search |
| POST | `/recipes/from-name` | Bedrock AI recipe generation |
| POST | `/recipes/:id/save` | Save/favourite recipe |
| DELETE | `/recipes/:id/save` | Unsave/unfavourite recipe |
| GET | `/me/profile` | Get profile |
| PATCH | `/me/profile` | Update profile |

### 3.4 Prisma Schema

Only the models required for V2 features:

- `UserProfile` — auth, name, email, onboardingCompleted
- `UserPreferenceProfile` — likes, dislikes, dietSignals, rawModelOutput
- `Question`, `QuestionOption`, `UserAnswer` — onboarding questionnaire
- `Ingredient` — canonical ingredient lookup
- `PantryItem` — per-user pantry items (Postgres, FK to `UserProfile`)
- `Recipe`, `RecipeIngredient` — cached Spoonacular + AI-generated recipes
- `SavedRecipe` — favourited recipes per user

Excluded models (not needed for V2): `DailySpecial`, `CookingHistory`, `UserRecipeSelection`, `CuratedRecipeImage`, `SeedOffset`, `PantryMeta`, `MealPlan`, embedding column on Recipe.

---

## 4. Frontend (`apps/web`)

### 4.1 Stack

- React 19 + Vite 7, TypeScript
- Tailwind CSS v4 + shadcn/ui
- Redux Toolkit (state management — from V2)
- Framer Motion (page/component animations — from V2)
- Lucide React (icons — from V2)
- `amazon-cognito-identity-js` (Cognito auth — from V1)

### 4.2 Module Structure

Mirrors V1 `src/modules/` layout, scoped to V2 features only:

```
src/
├── app/
│   ├── application/   useSession.ts, useAppNavigation.ts, useIdentity.ts
│   ├── styles/        app.css
│   └── App.tsx
├── lib/
│   ├── api/           client.ts, helpers.ts, types.ts
│   ├── hooks/         useApi.ts, useMutation.ts
│   └── utils/         format.ts, validation.ts
├── modules/
│   ├── auth/
│   │   ├── application/  useAuth.ts
│   │   ├── infra/        cognito.api.ts, cognito.pool.ts
│   │   ├── model/        auth.types.ts
│   │   └── ui/
│   │       ├── components/  LoginForm.tsx, SignupForm.tsx
│   │       └── pages/       LoginPage.tsx, SignUpPage.tsx
│   ├── onboarding/
│   │   ├── application/  useOnboardingQuestionnaire.ts
│   │   ├── infra/        onboarding.api.ts
│   │   ├── model/        onboarding.types.ts
│   │   └── ui/
│   │       └── components/  OnboardingQuestionnaire.tsx
│   ├── dashboard/
│   │   └── ui/pages/     DashboardPage.tsx
│   ├── pantry/
│   │   ├── application/  usePantry.ts, useImageUploadParser.ts
│   │   ├── infra/        pantry.api.ts
│   │   ├── model/        pantry.types.ts, quantity.ts
│   │   └── ui/
│   │       ├── components/  AddItemModal.tsx, ImageUploadParser.tsx
│   │       └── pages/       PantryPage.tsx
│   ├── recipes/
│   │   ├── application/  useRecipeSuggestions.ts, useRecipeDetails.ts, useRecipeSave.ts
│   │   ├── infra/        recipes.api.ts
│   │   ├── model/        recipes.types.ts
│   │   └── ui/
│   │       ├── components/  RecipeDetailsModal.tsx
│   │       └── pages/       RecipesPage.tsx, AiRecipesPage.tsx, FavouritesPage.tsx
│   ├── planner/
│   │   ├── model/        planner.types.ts
│   │   └── ui/pages/     PlannerPage.tsx
│   └── profile/
│       ├── application/  useProfilePageData.ts
│       ├── infra/        profile.api.ts
│       ├── model/        profile.types.ts
│       └── ui/pages/     ProfilePage.tsx
├── styles/
│   └── global.css
└── main.tsx
```

### 4.3 Pages

| Page | Module | What it does |
|------|--------|--------------|
| Landing | `app` | Marketing CTA with login / signup |
| Login | `auth` | Email + password, Cognito + local fallback |
| Signup | `auth` | Email + password registration |
| Onboarding | `onboarding` | 4-step: diet → allergies → taste → goals |
| Dashboard | `dashboard` | Pantry health / ingredient / planning charts, recent items |
| Pantry | `pantry` | Category-grouped inventory, expiry progress bar, add/delete |
| Scan | `pantry` | Image upload → Bedrock → review/edit items → bulk save |
| Recipes | `recipes` | Spoonacular suggestions by pantry, heart to favourite, add to plan |
| AI Recipes | `recipes` | Bedrock-generated recipes by pantry, add to plan |
| Meal Planner | `planner` | Planned meals list + shopping list (have/missing columns) |
| Favourites | `recipes` | Saved recipes list, view details modal, remove |
| Profile | `profile` | User info, view/edit preferences, re-open questionnaire |

### 4.4 State Management

Redux Toolkit slices (from V2):

| Slice | State |
|-------|-------|
| `ingredientsSlice` | Pantry items array, save status |
| `preferencesSlice` | Onboarding payload, onboardingCompleted flag |
| `recipesSlice` | Spoonacular results, AI recipes, selected recipe details |
| `favoritesSlice` | Saved/hearted recipes |
| `mealPlannerSlice` | Planned recipes array, shopping list text |

### 4.5 Auth Flow

Mirrors V2 auth flow:
1. Cognito signup → email verification → login
2. `POST /me/bootstrap` on login to upsert UserProfile
3. Local auth fallback (offline mode, same as V2 `localAuth.ts`)
4. Session revive from `localStorage` on reload

---

## 5. Shared Packages

| Package | Contents |
|---------|----------|
| `shared-types` | Interfaces shared between `web` and `api` |
| `shared-utils` | Common utility functions |
| `tsconfig` | `base.json` extended by all apps |
| `eslint-config` | Shared ESLint rules |

---

## 6. Infrastructure (`infra/aws/sam`)

Minimal SAM template for V2 feature scope:

- `PantryPalApiFunction` — Lambda (Node 20, 512 MB, 15s)
- `PantryPalHttpApi` — API Gateway HTTP API with CORS

Excluded from SAM: `DailySpecialPrewarmFunction`, `PrewarmJobFunction`, EventBridge schedules (not needed without daily special).

---

## 7. Environment Variables

### `apps/api/.env`
```
PORT=8788
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?schema=pantrypal_app
COGNITO_REGION=us-east-2
COGNITO_USER_POOL_ID=us-east-2_xxxxxxxx
COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-2
BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
PANTRY_IMAGES_BUCKET=pantrypal-pantry-images
SPOONACULAR_API_KEY=<key>
```

### `apps/web/.env`
```
VITE_API_BASE_URL=http://localhost:8788
VITE_COGNITO_REGION=us-east-2
VITE_COGNITO_USER_POOL_ID=us-east-2_xxxxxxxx
VITE_COGNITO_APP_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 8. Quick Start

```bash
npm install
npm run dev:api
npm run dev:web
```
