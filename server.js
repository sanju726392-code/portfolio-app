'use strict';

const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Contact = require('./models/Contact');

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 5000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const ADMIN_EMAIL = String(
    process.env.ADMIN_EMAIL || ''
).trim().toLowerCase();

const ADMIN_PASSWORD = String(
    process.env.ADMIN_PASSWORD || ''
);

const ADMIN_TOKEN_SECRET = String(
    process.env.ADMIN_TOKEN_SECRET || ''
);

// =====================================================
// BASIC SECURITY
// =====================================================

app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use((req, res, next) => {

    res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
    );

    res.setHeader(
        'X-Frame-Options',
        'SAMEORIGIN'
    );

    res.setHeader(
        'Referrer-Policy',
        'strict-origin-when-cross-origin'
    );

    res.setHeader(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()'
    );

    next();
});

// =====================================================
// BODY PARSER
// =====================================================

app.use(
    express.json({
        limit: '50kb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '50kb'
    })
);

// =====================================================
// STATIC WEBSITE
// =====================================================

app.use(
    express.static(PUBLIC_DIR)
);

// =====================================================
// WEBSITE
// =====================================================

app.get('/', (_req, res) => {

    res.sendFile(
        path.join(
            PUBLIC_DIR,
            'index.html'
        )
    );

});

// =====================================================
// ADMIN PAGE
// =====================================================

app.get('/admin', (_req, res) => {

    res.sendFile(
        path.join(
            PUBLIC_DIR,
            'admin',
            'index.html'
        )
    );

});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/api/health', (_req, res) => {

    res.json({

        success: true,

        status: 'ok',

        database:
            mongoose.connection.readyState === 1
                ? 'connected'
                : 'not-connected'

    });

});

// =====================================================
// CONTACT RATE LIMITER
// =====================================================

const contactAttempts = new Map();

function contactLimiter(req, res, next) {

    const key =
        req.ip ||
        req.socket.remoteAddress ||
        'unknown';

    const now = Date.now();

    const record =
        contactAttempts.get(key);

    if (
        !record ||
        now - record.start >
            15 * 60 * 1000
    ) {

        contactAttempts.set(
            key,
            {
                start: now,
                count: 1
            }
        );

        return next();
    }

    if (record.count >= 8) {

        return res.status(429).json({

            success: false,

            message:
                'Too many messages. Please try again later.'

        });

    }

    record.count += 1;

    next();
}

// =====================================================
// CONTACT FORM
// =====================================================

app.post(
    '/api/contact',
    contactLimiter,
    async (req, res) => {

        try {

            const name =
                String(
                    req.body.name || ''
                ).trim();

            const email =
                String(
                    req.body.email || ''
                )
                    .trim()
                    .toLowerCase();

            const message =
                String(
                    req.body.message || ''
                ).trim();

            // -------------------------
            // NAME
            // -------------------------

            if (
                name.length < 2 ||
                name.length > 80
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Please enter a valid name.'

                });

            }

            // -------------------------
            // EMAIL
            // -------------------------

            if (
                email.length > 120 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                    email
                )
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Please enter a valid email address.'

                });

            }

            // -------------------------
            // MESSAGE
            // -------------------------

            if (
                message.length < 10 ||
                message.length > 2000
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Message should be between 10 and 2000 characters.'

                });

            }

            // -------------------------
            // DATABASE CHECK
            // -------------------------

            if (
                mongoose.connection.readyState !== 1
            ) {

                return res.status(503).json({

                    success: false,

                    message:
                        'Database is not connected.'

                });

            }

            // -------------------------
            // SAVE
            // -------------------------

            await Contact.create({

                name,

                email,

                message,

                status: 'new'

            });

            return res.status(201).json({

                success: true,

                message:
                    'Message sent successfully!'

            });

        } catch (error) {

            console.error(
                'Contact submission error:',
                error.message
            );

            return res.status(500).json({

                success: false,

                message:
                    'Something went wrong. Please try again.'

            });

        }

    }
);

// =====================================================
// SECURE TOKEN FUNCTIONS
// =====================================================

function safeEqual(a, b) {

    const left =
        Buffer.from(
            String(a)
        );

    const right =
        Buffer.from(
            String(b)
        );

    if (
        left.length !==
        right.length
    ) {

        return false;
    }

    return crypto.timingSafeEqual(
        left,
        right
    );
}

// =====================================================
// CREATE ADMIN TOKEN
// =====================================================

function issueToken() {

    const payload = {

        email:
            ADMIN_EMAIL,

        role:
            'admin',

        exp:
            Date.now() +
            8 * 60 * 60 * 1000

    };

    const body =
        Buffer
            .from(
                JSON.stringify(
                    payload
                )
            )
            .toString(
                'base64url'
            );

    const signature =
        crypto
            .createHmac(
                'sha256',
                ADMIN_TOKEN_SECRET
            )
            .update(body)
            .digest(
                'base64url'
            );

    return `${body}.${signature}`;
}

// =====================================================
// VERIFY ADMIN TOKEN
// =====================================================

function verifyToken(token) {

    if (
        !token ||
        !ADMIN_TOKEN_SECRET
    ) {

        return null;
    }

    const parts =
        String(token).split('.');

    if (
        parts.length !== 2
    ) {

        return null;
    }

    const body =
        parts[0];

    const signature =
        parts[1];

    const expected =
        crypto
            .createHmac(
                'sha256',
                ADMIN_TOKEN_SECRET
            )
            .update(body)
            .digest(
                'base64url'
            );

    if (
        !safeEqual(
            signature,
            expected
        )
    ) {

        return null;
    }

    try {

        const payload =
            JSON.parse(
                Buffer
                    .from(
                        body,
                        'base64url'
                    )
                    .toString(
                        'utf8'
                    )
            );

        if (
            payload.role !==
            'admin'
        ) {

            return null;
        }

        if (
            !payload.exp
        ) {

            return null;
        }

        if (
            Date.now() >
            payload.exp
        ) {

            return null;
        }

        return payload;

    } catch {

        return null;
    }
}

// =====================================================
// BEARER TOKEN
// =====================================================

function getBearerToken(req) {

    const authorization =
        String(
            req.headers.authorization ||
            ''
        );

    if (
        !authorization.startsWith(
            'Bearer '
        )
    ) {

        return '';
    }

    return authorization
        .slice(7)
        .trim();
}

// =====================================================
// ADMIN AUTHORIZATION
// =====================================================

function requireAdmin(
    req,
    res,
    next
) {

    const token =
        getBearerToken(req);

    const admin =
        verifyToken(token);

    if (!admin) {

        return res.status(401).json({

            success: false,

            message:
                'Unauthorized'

        });

    }

    req.admin =
        admin;

    next();
}

// =====================================================
// ADMIN LOGIN
// =====================================================

app.post(
    '/api/admin/login',
    (req, res) => {

        try {

            // -------------------------
            // CONFIG CHECK
            // -------------------------

            if (
                !ADMIN_EMAIL ||
                !ADMIN_PASSWORD ||
                !ADMIN_TOKEN_SECRET
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        'Admin login is not configured. Check .env.'

                });

            }

            // -------------------------
            // USER INPUT
            // -------------------------

            const email =
                String(
                    req.body.email || ''
                )
                    .trim()
                    .toLowerCase();

            const password =
                String(
                    req.body.password || ''
                );

            // -------------------------
            // COMPARE
            // -------------------------

            const emailCorrect =
                safeEqual(
                    email,
                    ADMIN_EMAIL
                );

            const passwordCorrect =
                safeEqual(
                    password,
                    ADMIN_PASSWORD
                );

            if (
                !emailCorrect ||
                !passwordCorrect
            ) {

                return res.status(401).json({

                    success: false,

                    message:
                        'Invalid email or password.'

                });

            }

            // -------------------------
            // CREATE TOKEN
            // -------------------------

            const token =
                issueToken();

            return res.json({

                success: true,

                token,

                user: {

                    email:
                        ADMIN_EMAIL,

                    role:
                        'admin'

                }

            });

        } catch (error) {

            console.error(
                'Admin login error:',
                error.message
            );

            return res.status(500).json({

                success: false,

                message:
                    'Login failed.'

            });

        }

    }
);

// =====================================================
// ADMIN ME
// =====================================================

app.get(
    '/api/admin/me',
    requireAdmin,
    (req, res) => {

        res.json({

            success: true,

            user: {

                email:
                    req.admin.email,

                role:
                    req.admin.role

            }

        });

    }
);

// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
    '/api/admin/logout',
    (_req, res) => {

        res.json({

            success: true,

            message:
                'Logged out successfully.'

        });

    }
);

// =====================================================
// ADMIN STATS
// =====================================================

app.get(
    '/api/admin/stats',
    requireAdmin,
    async (_req, res) => {

        try {

            const [
                total,
                unread,
                read,
                archived,
                recent,
                daily
            ] =
                await Promise.all([

                    Contact.countDocuments(),

                    Contact.countDocuments({
                        $or: [
                            {
                                status: 'new'
                            },
                            {
                                status: {
                                    $exists:
                                        false
                                }
                            }
                        ]
                    }),

                    Contact.countDocuments({
                        status:
                            'read'
                    }),

                    Contact.countDocuments({
                        status:
                            'archived'
                    }),

                    Contact.countDocuments({

                        createdAt: {

                            $gte:
                                new Date(
                                    Date.now() -
                                    30 *
                                    24 *
                                    60 *
                                    60 *
                                    1000
                                )

                        }

                    }),

                    Contact.aggregate([

                        {
                            $match: {

                                createdAt: {

                                    $gte:
                                        new Date(
                                            Date.now() -
                                            6 *
                                            24 *
                                            60 *
                                            60 *
                                            1000
                                        )

                                }

                            }

                        },

                        {
                            $group: {

                                _id: {

                                    $dateToString: {

                                        format:
                                            '%Y-%m-%d',

                                        date:
                                            '$createdAt'

                                    }

                                },

                                count: {

                                    $sum: 1

                                }

                            }

                        },

                        {
                            $sort: {

                                _id:
                                    1

                            }

                        }

                    ])

                ]);

            res.json({

                success: true,

                stats: {

                    total,

                    unread,

                    read,

                    archived,

                    recent,

                    daily

                }

            });

        } catch (error) {

            console.error(
                'Stats error:',
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    'Failed to load dashboard statistics.'

            });

        }

    }
);

// =====================================================
// ADMIN MESSAGES
// =====================================================

app.get(
    '/api/admin/messages',
    requireAdmin,
    async (req, res) => {

        try {

            const q =
                String(
                    req.query.q || ''
                ).trim();

            const status =
                String(
                    req.query.status ||
                    'all'
                ).trim();

            const page =
                Math.max(
                    Number(
                        req.query.page
                    ) || 1,
                    1
                );

            const limit =
                Math.min(
                    Math.max(
                        Number(
                            req.query.limit
                        ) || 10,
                        5
                    ),
                    50
                );

            const filter = {};

            // -------------------------
            // STATUS
            // -------------------------

            if (
                [
                    'new',
                    'read',
                    'archived'
                ].includes(status)
            ) {

                filter.status =
                    status;

            }

            // -------------------------
            // SEARCH
            // -------------------------

            if (q) {

                filter.$or = [

                    {
                        name: {

                            $regex:
                                q,

                            $options:
                                'i'

                        }

                    },

                    {
                        email: {

                            $regex:
                                q,

                            $options:
                                'i'

                        }

                    },

                    {
                        message: {

                            $regex:
                                q,

                            $options:
                                'i'

                        }

                    }

                ];

            }

            const skip =
                (page - 1) *
                limit;

            const [
                items,
                total
            ] =
                await Promise.all([

                    Contact
                        .find(filter)
                        .sort({
                            createdAt:
                                -1
                        })
                        .skip(skip)
                        .limit(limit)
                        .lean(),

                    Contact.countDocuments(
                        filter
                    )

                ]);

            const messages =
                items.map(
                    (item) => ({

                        ...item,

                        status:
                            item.status ||
                            'new'

                    })
                );

            res.json({

                success: true,

                messages,

                pagination: {

                    page,

                    limit,

                    total,

                    pages:
                        Math.max(
                            Math.ceil(
                                total /
                                limit
                            ),
                            1
                        )

                }

            });

        } catch (error) {

            console.error(
                'Messages error:',
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    'Failed to load messages.'

            });

        }

    }
);

// =====================================================
// UPDATE MESSAGE STATUS
// =====================================================

app.patch(
    '/api/admin/messages/:id/status',
    requireAdmin,
    async (req, res) => {

        try {

            const status =
                String(
                    req.body.status ||
                    ''
                ).trim();

            if (
                ![
                    'new',
                    'read',
                    'archived'
                ].includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Invalid status.'

                });

            }

            const updated =
                await Contact.findByIdAndUpdate(

                    req.params.id,

                    {
                        status
                    },

                    {
                        new: true
                    }

                ).lean();

            if (!updated) {

                return res.status(404).json({

                    success: false,

                    message:
                        'Message not found.'

                });

            }

            res.json({

                success: true,

                message: {

                    ...updated,

                    status:
                        updated.status ||
                        'new'

                }

            });

        } catch (error) {

            console.error(
                'Status update error:',
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    'Failed to update message.'

            });

        }

    }
);

// =====================================================
// DELETE MESSAGE
// =====================================================

app.delete(
    '/api/admin/messages/:id',
    requireAdmin,
    async (req, res) => {

        try {

            const deleted =
                await Contact.findByIdAndDelete(
                    req.params.id
                );

            if (!deleted) {

                return res.status(404).json({

                    success: false,

                    message:
                        'Message not found.'

                });

            }

            res.json({

                success: true,

                message:
                    'Message deleted successfully.'

            });

        } catch (error) {

            console.error(
                'Delete error:',
                error.message
            );

            res.status(500).json({

                success: false,

                message:
                    'Failed to delete message.'

            });

        }

    }
);

// =====================================================
// API 404
// =====================================================

app.use(
    '/api',
    (_req, res) => {

        res.status(404).json({

            success: false,

            message:
                'API endpoint not found'

        });

    }
);

// =====================================================
// WEBSITE 404
// =====================================================

app.use(
    (_req, res) => {

        res.status(404).sendFile(

            path.join(
                PUBLIC_DIR,
                '404.html'
            )

        );

    }
);

// =====================================================
// DATABASE + SERVER
// =====================================================

async function startServer() {

    // -------------------------
    // ENV CHECK
    // -------------------------

    if (
        !process.env.MONGODB_URI
    ) {

        console.error(
            'MONGODB_URI is missing from .env'
        );

        process.exit(1);

    }

    // -------------------------
    // ADMIN CHECK
    // -------------------------

    if (
        !ADMIN_EMAIL ||
        !ADMIN_PASSWORD ||
        !ADMIN_TOKEN_SECRET
    ) {

        console.warn(
            'WARNING: Admin credentials are not completely configured.'
        );

    } else {

        console.log(
            `Admin login configured for: ${ADMIN_EMAIL}`
        );

    }

    try {

        // -------------------------
        // MONGODB ATLAS CONNECTION
        // -------------------------

        await mongoose.connect(
            process.env.MONGODB_URI,
            {

                // DNS/server discovery timeout
                serverSelectionTimeoutMS:
                    30000,

                // Initial connection timeout
                connectTimeoutMS:
                    30000,

                // Socket timeout
                socketTimeoutMS:
                    60000,

                // Keep connection pool controlled
                maxPoolSize:
                    10,

                minPoolSize:
                    0,

                // Force IPv4
                family:
                    4

            }
        );

        console.log(
            'MongoDB connected successfully.'
        );

        console.log(
            `Connected database: ${
                mongoose.connection.name ||
                'unknown'
            }`
        );

        // -------------------------
        // SERVER
        // -------------------------

        app.listen(
            PORT,
            () => {

                console.log(
                    `Portfolio server running at http://localhost:${PORT}`
                );

                console.log(
                    `Admin dashboard: http://localhost:${PORT}/admin`
                );

            }
        );

    } catch (error) {

        console.error(
            'MongoDB connection failed:',
            error.message
        );

        console.error(
            'Please check MongoDB Atlas Network Access, database credentials, and your network connection.'
        );

        process.exit(1);

    }

}

// =====================================================
// START
// =====================================================

startServer();