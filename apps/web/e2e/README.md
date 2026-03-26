# End-to-End Tests (Playwright)

Automated browser tests for critical user flows in the Profitlymation Platform.

## Setup

```bash
cd apps/web

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install
```

## Running Tests

### All Tests (Headless)
```bash
npm run test:e2e
```

### Interactive UI Mode
```bash
npm run test:e2e:ui
```

### Debug Mode (Step through tests)
```bash
npm run test:e2e:debug
```

### Specific Test File
```bash
npx playwright test e2e/auth.spec.ts
```

### Specific Browser
```bash
npx playwright test --project=chromium
```

## Test Coverage

### ✅ Authentication (`auth.spec.ts`)
- Landing page display
- Registration flow
- Login with valid/invalid credentials
- Logout
- Password visibility toggle
- Navigation between login/register

### ✅ Dashboard (`dashboard.spec.ts`)
- Display key metrics
- Connection status
- Navigation to products/orders
- Recent transactions table
- Shop selector
- Mobile sidebar toggle
- Data sync triggers

### ✅ Products (`products.spec.ts`)
- List products
- Create product with validation
- Filter by shop
- Pagination

- View/edit product details

## Test Structure

```
e2e/
├── auth.spec.ts          # Authentication flows
├── dashboard.spec.ts     # Dashboard functionality
├── products.spec.ts      # Product management
├── orders.spec.ts        # Order management (TODO)
└── settings.spec.ts      # Settings and config (TODO)
```

## Configuration

`playwright.config.ts`:
- Base URL: `http://localhost:3000`
- Timeout: 30s per test
- Retries: 2 on CI, 0 locally
- Browsers: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari
- Artifacts: Screenshots/videos on failure

## Best Practices

1. **Use data-testid for stable selectors**
   ```html
   <button data-testid="submit-button">Submit</button>
   ```

2. **Wait for network idle**
   ```ts
   await page.waitForLoadState('networkidle');
   ```

3. **Use page objects for complex flows**
   ```ts
   class LoginPage {
     async login(email, password) { ... }
   }
   ```

4. **Clean up test data**
   ```ts
   test.afterEach(async () => {
     // Delete test products
   });
   ```

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run E2E Tests
  run: |
    npm run test:e2e
  env:
    E2E_BASE_URL: https://staging.example.com
```

## Viewing Results

After test run:
```bash
npx playwright show-report
```

Opens HTML report with:
- Test results
- Screenshots
- Videos
- Network logs
- Console output

## Debugging Failed Tests

1. **Run in headed mode**
   ```bash
   npx playwright test --headed
   ```

2. **Use Playwright Inspector**
   ```bash
   npm run test:e2e:debug
   ```

3. **Check screenshots**
   ```
   test-results/
   └── auth-should-login-chromium/
       └── test-failed-1.png
   ```

## Performance Targets

- Page load: < 3s
- User action response: < 1s
- Test suite completion: < 10 minutes

## Test Data

Use test accounts:
- Email: `test@example.com`
- Password: `TestPassword123!`

Create via seeder script:
```bash
npm run seed:test-data
```
