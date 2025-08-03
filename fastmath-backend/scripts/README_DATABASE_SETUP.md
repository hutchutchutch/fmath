# FastMath Database Setup Instructions

## Current Issue

The FastMath application is unable to start assessments because:
1. **No tracks have data in the DynamoDB database** - All tracks (TRACK1-TRACK12) are empty
2. **The test user has a null focusTrack** - This prevents the assessment from starting
3. **AWS credentials are not configured** in the shell environment

## Solution Steps

### 1. Set AWS Credentials

First, you need to configure AWS credentials. Add these to your shell environment:

```bash
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_REGION=us-east-1
```

You can add these to your `~/.bashrc` or `~/.zshrc` file for persistence.

### 2. Populate TRACK12 Data (Required for Onboarding)

TRACK12 is used for the initial onboarding assessment. Run this script to populate it:

```bash
cd /Users/hutch/Documents/projects/gauntlet/bounty/fastmath/fastmath-backend
npx ts-node scripts/populateTrack12.ts
```

This will create:
- Track metadata for TRACK12 (Addition Within 10)
- 66 addition facts where the sum is 10 or less
- Facts with IDs from FACT1508 to FACT1573

### 3. Fix User's Focus Track

The test user (hutch.herchenbach@gauntletai.com) has a null focusTrack. Fix this by running:

```bash
npx ts-node scripts/fixUserFocusTrack.ts
```

This will:
- Set the user's focusTrack to "ALL"
- Allow the user to access all tracks
- Enable the onboarding assessment to start

### 4. (Optional) Populate Other Tracks

If you need to populate other tracks, you can create similar scripts based on `populateTrack12.ts`. Here are the track ranges:

- TRACK1: Facts 1-99 (Deprecated Addition)
- TRACK2: Facts 100-195 (Deprecated Subtraction)
- TRACK3: Facts 196-279 (Deprecated Multiplication)
- TRACK4: Facts 280-367 (Deprecated Division)
- TRACK5: Facts 368-511 (Division up to 12)
- TRACK6: Facts 512-742 (Addition up to 20)
- TRACK7: Facts 743-911 (Multiplication up to 12)
- TRACK8: Facts 912-1142 (Subtraction up to 20)
- TRACK9: Facts 1143-1242 (Single-digit Addition)
- TRACK10: Facts 1243-1407 (Single-digit Subtraction)
- TRACK11: Facts 1408-1507 (Single-digit Multiplication)
- TRACK12: Facts 1508-1573 (Addition within 10)

### 5. Restart the Application

After populating the data, restart the FastMath application:

```bash
./start-fastmath.sh
```

## Verification

After completing these steps:
1. Login with hutch.herchenbach@gauntletai.com / testpassword123
2. You should be redirected to the onboarding assessment
3. The "Start Assessment" button should now be enabled
4. The assessment will begin with TRACK12 (Addition Within 10)

## Troubleshooting

If you still have issues:
1. Check AWS credentials are correctly set: `echo $AWS_ACCESS_KEY_ID`
2. Verify the DynamoDB table name is "FastMath2"
3. Check the AWS region matches your table location
4. Look at the browser console for specific error messages
5. Check the backend logs for database connection errors

## Note on Database State

The current database appears to be empty or inaccessible. This could be because:
- This is a fresh installation without seed data
- The database was recently created or migrated
- AWS credentials are missing or incorrect
- The application expects data to be populated manually

For a production setup, you would typically have:
- A seed data script that populates all tracks
- Migration scripts to set up the database schema
- Proper AWS IAM roles and permissions