# Facebook publishing (official Meta Graph API)

Publishing is done **only** through the official Graph API — no browser
automation, no scrapers.

## 1. Create a Facebook app

1. Go to https://developers.facebook.com/apps → **Create app**.
2. Add the **Facebook Login** product.
3. Under *Use cases* → *Pages*, enable **Pages API** permission set:
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_read_user_content`
4. Add **Page Public Content Access** if you plan to fetch page metrics later.
5. Under *Facebook Login* settings add this redirect URI (must match env):
   ```
   http://localhost:4000/api/facebook/oauth/callback
   ```

## 2. Configure the environment

```dotenv
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_REDIRECT_URI=http://localhost:4000/api/facebook/oauth/callback
FACEBOOK_GRAPH_VERSION=v22.0
FACEBOOK_TOKEN_ENCRYPTION_KEY=<32+ char random string, base64 or plain>
```

`FACEBOOK_TOKEN_ENCRYPTION_KEY` is used for AES-256-GCM encryption of page
access tokens **at rest**. Tokens are decrypted only inside the publish worker.

## 3. Connect a page

1. Sign in to the dashboard.
2. *Facebook* → **Connect a page**.
3. The OAuth flow stores every managed page and its (encrypted) page token.

## 4. Publishing behavior

- **Manual**: user clicks *Publish now* on a READY video.
- **Scheduled**: user picks a time; the publish job is delayed in BullMQ until
  then and sent with `published=false` + `scheduled_publish_time`.
- **Full automatic**: project `publishingMode=FULL_AUTOMATIC` + a linked page →
  the worker publishes immediately after QA passes.

## Troubleshooting

| Code | Meaning | Fix |
| ---- | ------- | --- |
| 190   | Token expired/invalid | Re-connect the page |
| 200   | Permission missing    | Add the Pages permissions above and re-connect |
| 4/17  | Rate limit            | Publish less often; jobs auto-backoff |
| 368   | `scheduled_publish_time` in the past | Re-publish without a date |
