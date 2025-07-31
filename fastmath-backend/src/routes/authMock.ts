import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

// Mock user store (in-memory)
const mockUsers = new Map<string, any>();

// Add a default test user
const testUserId = uuidv4();
mockUsers.set('hutch.herchenbach@gauntletai.com', {
    userId: testUserId,
    email: 'hutch.herchenbach@gauntletai.com',
    name: 'Test User',
    password: 'password123', // In real app, this would be hashed
    ageGrade: 12,
    currentTrack: 'TRACK1',
    focusTrack: 'TRACK1'
});

router.post('/signup', async (req: Request, res: Response) => {
    try {
        const { email, password, name, ageGrade } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }
        
        const normalizedEmail = email.toLowerCase();
        
        if (mockUsers.has(normalizedEmail)) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        const userId = uuidv4();
        const newUser = {
            userId,
            email: normalizedEmail,
            name: name || '',
            password, // In real app, hash this
            ageGrade: ageGrade || 12,
            currentTrack: 'TRACK1',
            focusTrack: 'TRACK1',
            createdAt: new Date().toISOString()
        };
        
        mockUsers.set(normalizedEmail, newUser);
        
        const token = jwt.sign(
            { userId, email: normalizedEmail },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                email: normalizedEmail,
                userId,
                name: newUser.name,
                currentTrack: newUser.currentTrack
            }
        });
    } catch (error) {
        console.error('Mock signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const normalizedEmail = email.toLowerCase();
        
        const user = mockUsers.get(normalizedEmail);
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        // Simple password check (in real app, use bcrypt)
        if (user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.userId, email: normalizedEmail },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                email: normalizedEmail,
                userId: user.userId,
                name: user.name,
                currentTrack: user.currentTrack,
                ageGrade: user.ageGrade
            }
        });
    } catch (error) {
        console.error('Mock login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/validate', (req: Request, res: Response) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ valid: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const user = mockUsers.get(decoded.email);
        
        if (!user) {
            return res.status(401).json({ valid: false, message: 'User not found' });
        }
        
        res.json({
            valid: true,
            user: {
                email: user.email,
                userId: user.userId,
                name: user.name,
                currentTrack: user.currentTrack,
                ageGrade: user.ageGrade
            }
        });
    } catch (error) {
        res.status(401).json({ valid: false, message: 'Invalid token' });
    }
});

// Mock magic link
router.post('/magic-link', async (req: Request, res: Response) => {
    const { email } = req.body;
    console.log(`Mock magic link would be sent to: ${email}`);
    res.json({ message: 'Magic link sent (mock mode - check console)' });
});

export default router;