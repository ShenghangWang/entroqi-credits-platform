# External AI Application Integration Contract

The Credits Platform is reusable billing infrastructure. External AI applications pass only billing metadata; vertical business data stays outside this module.

## Register An Application

```http
POST /integration/applications
```

```json
{
  "code": "used_car_ai",
  "name": "Used Car AI",
  "description": "AI image generation for used car dealers"
}
```

## Register Billable Functions

```http
POST /integration/applications/used_car_ai/functions
```

```json
{
  "code": "car_bg_showroom",
  "name": "Car Showroom Background",
  "description": "Generate a showroom background for one vehicle image",
  "chargeMode": "estimate_required",
  "defaultPoints": "12.0000"
}
```

Supported charge modes:

- `fixed`
- `dynamic`
- `estimate_required`

## Runtime Usage Flow

External apps should use this sequence:

```text
POST /billing/estimate
POST /billing/freeze
run external AI task
POST /billing/settle on success
POST /billing/refund on failure
```

The app should send:

```json
{
  "userId": 7,
  "accountScope": "personal",
  "applicationCode": "used_car_ai",
  "functionCode": "car_bg_showroom",
  "estimatedPoints": "30.0000",
  "bizType": "image_generation",
  "bizId": "used_car_task_12345",
  "idempotencyKey": "unique-operation-key"
}
```

`estimatedPoints` is optional. When omitted, the credits platform uses the registered function's `default_points`. usedCarPlatform sends this field only for dynamic charging rules, such as batch visual processing where extra toggled options change the per-image price.

For tenant usage, pass `accountScope = "tenant"` and `tenantId`. The backend verifies membership through `tenant_members`.

## Idempotency

Every credit-changing request must include an `idempotencyKey`.

Same key plus same request body returns the original response with:

```json
{
  "idempotentReplay": true
}
```

Same key plus different request body returns `409 conflict`.

## Frontend Must Not Send

Do not trust frontend-provided:

- `amount`
- `points`
- `bonusPoints`
- `commissionRate`
- tenant permission
- role permission

The backend derives pricing from `application_functions` and `recharge_products`.

## Recharge Flow

```text
GET /recharge-products
POST /payment-orders
payment provider callback
POST /payment-callbacks/:channel
```

Callbacks must be signed with the configured `PAYMENT_CALLBACK_SECRET`.

## Introspection

```http
GET /integration/contract
GET /integration/applications
GET /integration/applications/:applicationCode/functions
```

## usedCarPlatform Registration

The usedCarPlatform integration uses this application code:

```text
used-car-platform
```

The repeatable setup command is:

```sh
npm run seed:used-car
```

For local smoke tests with account data:

```sh
npm run seed:used-car:demo
```

Registered used-car functions:

| Function code | Default points | Usage |
| --- | ---: | --- |
| `showroom-light` | `30.0000` | Single exterior image generation |
| `outdoor-scene` | `30.0000` | Single exterior image generation |
| `road-motion` | `30.0000` | Single exterior image generation |
| `sky-studio` | `30.0000` | Single exterior image generation |
| `paint-refresh` | `30.0000` | Single image enhancement |
| `light-consistency` | `30.0000` | Single image enhancement |
| `interior-clean` | `30.0000` | Single interior image generation |
| `interior-collage` | `30.0000` | One generated interior collage output |
| `watermark-remove` | `30.0000` | Single image enhancement |
| `batch-new-exterior` | `30.0000` | One exterior item in a batch task before dynamic option extras |
| `batch-new-interior` | `30.0000` | One interior item in a batch task before dynamic option extras |

These defaults mirror the current usedCarPlatform baseline. Dynamic batch option extras are sent per estimate request through `estimatedPoints`.
