const mongoose = require('mongoose');

const contactSchema =
    new mongoose.Schema(
        {
            name: {
                type: String,
                required: true,
                trim: true,
                maxlength: 80
            },

            email: {
                type: String,
                required: true,
                trim: true,
                lowercase: true,
                maxlength: 120
            },

            message: {
                type: String,
                required: true,
                trim: true,
                maxlength: 2000
            },

            status: {
                type: String,
                enum: [
                    'new',
                    'read',
                    'archived'
                ],
                default: 'new'
            }
        },
        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        'Contact',
        contactSchema
    );