# Supabase Function Conflict Resolution Steps

## Problem Summary
Error: "Could not choose the best candidate function between: public.admin_soft_delete_thread(p_id => text), public.admin_soft_delete_thread(p_id => uuid)"

## Solution Steps

### Step 1: Execute Function Conflict Resolution
**In Supabase SQL Editor, execute the entire content of:**
```
supabase-fix-function-conflict.sql
```

**This will:**
- ✅ Drop all conflicting functions (text vs uuid parameter types)
- ✅ Create unified `admin_soft_delete_thread(p_id TEXT)` function  
- ✅ Create unified `admin_soft_delete_comment(p_id TEXT)` function
- ✅ Implement full cascade delete functionality:
  - Soft delete all related comments/replies
  - Delete all likes and favorites 
  - Update all reports to 'resolved' status
  - Soft delete the main thread

### Step 2: Test Function Creation (Optional)
**In Supabase SQL Editor, execute the entire content of:**
```
supabase-test-functions.sql
```

**This will:**
- ✅ Create test functions for verification
- ✅ Show list of all created functions
- ✅ Verify table structure

### Step 3: Verify Functions Work
**Test the functions in Supabase SQL Editor:**

```sql
-- Test basic functionality
SELECT test_admin_function();

-- Check if functions exist (should show admin_soft_delete_thread and admin_soft_delete_comment)
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE 'admin_%'
ORDER BY routine_name;
```

### Step 4: Test in Admin Panel
**After executing the SQL:**
1. ✅ API code has been updated to use `admin_soft_delete_thread` (full cascade delete)
2. ✅ Go to your admin panel
3. ✅ Try deleting a thread - should now work without errors
4. ✅ Check that related comments, likes, favorites are also deleted/resolved

## What the Cascade Delete Does

### For Thread Deletion:
1. **Comments/Replies** → Soft deleted (is_deleted = TRUE, deleted_at = NOW())
2. **Likes** → Hard deleted (both thread likes and comment likes)
3. **Favorites** → Hard deleted  
4. **Reports** → Status updated to 'resolved' with reason
5. **Thread** → Soft deleted (is_deleted = TRUE, deleted_at = NOW())

### For Comment Deletion:
1. **Comment Likes** → Hard deleted
2. **Comment Reports** → Status updated to 'resolved'
3. **Comment** → Soft deleted (is_deleted = TRUE, deleted_at = NOW())

## Expected Results
- ✅ No more function conflict errors
- ✅ Admin panel delete button works properly  
- ✅ Cascade deletion removes all related data
- ✅ Reports are automatically resolved when content is deleted
- ✅ Detailed logging shows what was deleted

## Files Updated
- ✅ `/api/admin.js` - Now uses `admin_soft_delete_thread` for full cascade functionality
- ✅ Admin panel already has cascade delete confirmation messages

## Verification Commands
After successful execution, test in Supabase SQL Editor:

```sql
-- Verify no conflicting functions exist
SELECT routine_name, specific_name, routine_definition 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'admin_soft_delete_thread';
  
-- Should show only ONE function with TEXT parameter type
```

Execute these steps in order, and your cascade delete functionality should work perfectly! 🚀