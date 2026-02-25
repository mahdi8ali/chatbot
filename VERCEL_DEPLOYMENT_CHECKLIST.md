# ✅ Vercel Deployment Checklist

## قبل النشر:
- [x] Widget.js موجود في `/public/` (22KB)
- [x] API endpoint `/app/api/widget/route.ts` جاهز
- [x] `vercel.json` مع CORS headers
- [x] `.vercelignore` configured
- [x] Git committed & pushed to `main`
- [x] Repository: `mahdi8ali/chatbot`

---

## خطوات النشر:

### 1. افتح Vercel
```
https://vercel.com/new
```

### 2. Import Project
- [ ] اضغط "Add New" → "Project"
- [ ] اختر "Import Git Repository"
- [ ] ابحث عن: `mahdi8ali/chatbot`
- [ ] اضغط "Import"

### 3. Configure
- [ ] Framework Preset: **Next.js** (auto-detected ✅)
- [ ] Root Directory: `./`
- [ ] Build Command: `next build`
- [ ] Output Directory: `.next`

### 4. Environment Variables
اضغ "Environment Variables" وأضف:

- [ ] `OPENAI_API_KEY` = `sk-...`
- [ ] `SITE_API_BASE_URL` = `https://projects.alkafeel.net/api`
- [ ] `SITE_API_TOKEN` = `...`
- [ ] `SITE_DOMAIN` = `https://projects.alkafeel.net`

### 5. Deploy
- [ ] اضغط **"Deploy"**
- [ ] انتظر Build (2-3 دقائق)
- [ ] ✅ Deployment Complete!

### 6. Get URL
- [ ] انسخ Production URL: `https://chatbot-xxxxx.vercel.app`

---

## بعد النشر - Testing:

### Test 1: Widget Script
```bash
curl -I https://YOUR-DOMAIN.vercel.app/api/widget
```
- [ ] Status: `200 OK`
- [ ] Content-Type: `application/javascript`
- [ ] CORS headers present

### Test 2: Static File
```bash
curl -I https://YOUR-DOMAIN.vercel.app/widget.js
```
- [ ] Status: `200 OK`
- [ ] File size: 22KB

### Test 3: Test Page
افتح في المتصفح:
```
https://YOUR-DOMAIN.vercel.app/test-widget.html
```
- [ ] Page loads
- [ ] Widget button appears 💬
- [ ] Clicking opens chat panel
- [ ] Can send messages

### Test 4: Console Check
افتح Console:
```javascript
console.log(AlkafeelWidget);
```
- [ ] Object with `init` method appears

### Test 5: Chat Functionality
- [ ] اكتب رسالة: "ما هي المشاريع الموجودة؟"
- [ ] الرد يظهر
- [ ] Function calling يعمل
- [ ] Markdown formatting صحيح

---

## Integration في Laravel:

### في `resources/views/layouts/app.blade.php`:

```blade
{{-- قبل </body> --}}
<script src="https://YOUR-ACTUAL-DOMAIN/api/widget"></script>
<script>
  AlkafeelWidget.init({
    apiEndpoint: 'https://YOUR-ACTUAL-DOMAIN/api/chat/site',
    title: 'مساعدك في المشاريع',
    position: 'left'
  });
</script>
```

- [ ] استبدل `YOUR-ACTUAL-DOMAIN` بالدومين الفعلي
- [ ] Test في Laravel Dev Environment
- [ ] Test في Production

---

## Custom Domain (Optional):

### إذا أردت `chatbot.alkafeel.net`:

1. **في Vercel Dashboard:**
   - [ ] اذهب للمشروع
   - [ ] Settings → Domains
   - [ ] Add Domain: `chatbot.alkafeel.net`

2. **في DNS Provider:**
   - [ ] Type: `CNAME`
   - [ ] Name: `chatbot`
   - [ ] Value: `cname.vercel-dns.com`
   - [ ] TTL: `3600`

3. **Wait:**
   - [ ] انتظر 5-10 دقائق DNS propagation

4. **Test:**
   ```bash
   curl -I https://chatbot.alkafeel.net/api/widget
   ```
   - [ ] Status: `200 OK`

---

## Performance Checks:

### في DevTools:

1. **Network Tab:**
   - [ ] `widget.js` loads < 500ms
   - [ ] Size: ~8KB (gzipped)
   - [ ] No 404 errors

2. **Console:**
   - [ ] No JavaScript errors
   - [ ] No CORS warnings

3. **Mobile Test:**
   - [ ] Widget responsive
   - [ ] Button size appropriate
   - [ ] Chat panel fits screen

---

## Security Verification:

- [ ] Rate limiting working (test 20+ requests)
- [ ] CORS headers present
- [ ] XSS protection active
- [ ] Input sanitization working
- [ ] No API keys exposed in client

---

## Final Deliverables:

### URLs to provide:

1. **Widget Script:**
   ```
   https://YOUR-DOMAIN/api/widget
   ```

2. **Chat API:**
   ```
   https://YOUR-DOMAIN/api/chat/site
   ```

3. **Test Page:**
   ```
   https://YOUR-DOMAIN/test-widget.html
   ```

4. **Example Page:**
   ```
   https://YOUR-DOMAIN/example-laravel.html
   ```

### Documentation:
- [x] WIDGET_INTEGRATION.md
- [x] QUICK_START.md
- [x] DEPLOY_GUIDE.md
- [x] COMPLETION_SUMMARY.md
- [x] This Checklist

---

## 🎉 إذا تم كل شيء:

**Widget جاهز للاستخدام! 🚀**

استخدمه في أي موقع بسطرين:
```html
<script src="https://YOUR-DOMAIN/api/widget"></script>
<script>AlkafeelWidget.init({apiEndpoint: 'https://YOUR-DOMAIN/api/chat/site'});</script>
```

---

## Next Steps:

1. [ ] Monitor usage in Vercel Analytics
2. [ ] Set up error tracking (Sentry?)
3. [ ] Add more widget customization options
4. [ ] Consider caching strategies
5. [ ] A/B test widget positioning

---

**Deployment Date:** _____________
**Production URL:** _____________
**Status:** ⬜ Pending | ✅ Complete

---

Good luck! 🍀
