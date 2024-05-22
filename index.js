const express = require("express");
const schedule = require('node-schedule');
const { connectDB, disconnectDB, queryDB } = require('./database');
const nodemailer = require('nodemailer');
const app = express();
const fs = require('fs');
const moment = require('moment');
const { authenticateUser, verifyToken, hashPassword } = require('./auth'); // auth.js dosyalari import yapmak icin 

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// User login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const { user, token } = await authenticateUser(username, password);
        res.json({ success: true, token });
    } catch (error) {
        res.status(400).json({ success: false, error: 'Invalid credentials' });
    }
});

// Protected route example
app.get('/protected', verifyToken, (req, res) => {
    res.json({ success: true, message: 'This is a protected route', user: req.user });
});

// Existing routes...
app.get('/', (req, res) => {
    res.send('API\'ya hoş geldiniz');
});

app.post('/students', verifyToken, async (req, res) => {
    const { name, email, deptid, address, phone, clubs } = req.body;
    try {
        const result = await queryDB(
            'INSERT INTO public."students" (name, email, deptid, address, phone, clubs, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [name, email, deptid, address, phone, clubs, moment().format('YYYY-MM-DD HH:mm:ss'), moment().format('YYYY-MM-DD HH:mm:ss')]
        );
        await queryDB('UPDATE "student_counter" SET counter = counter + 1');
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Öğrenci eklenirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

app.delete('/students/:id', verifyToken, async (req, res) => {
    const studentId = req.params.id;
    try {
        const result = await queryDB('DELETE FROM public."students" WHERE id = $1 RETURNING *', [studentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Öğrenci bulunamadı' });
        } else {
            res.json({ success: true, message: 'Öğrenci başarıyla silindi' });
        }
    } catch (error) {
        console.error('Öğrenci silinirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

app.put('/students/:id', verifyToken, async (req, res) => {
    const studentId = req.params.id;
    const updatedAt = new Date();
    const { name, email, deptid, address, phone, clubs } = req.body;
    try {
        const result = await queryDB(
            'UPDATE public."students" SET name = $1, email = $2, deptid = $3, address = $4, phone = $5, clubs = $6, updated_at = $7 WHERE id = $8 RETURNING *',
            [name, email, deptid, address, phone, clubs, updatedAt, studentId]
        );
        await queryDB('UPDATE "student_counter" SET counter = counter - 1');
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Öğrenci bulunamadı' });
        } else {
            res.json({ success: true, message: 'Öğrenci başarıyla güncellendi', data: result.rows[0] });
        }
    } catch (error) {
        console.error('Öğrenci güncellenirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

app.post('/departments', verifyToken, async (req, res) => {
    const { name, dept_std_id, head_of_department, head_email, quota } = req.body;
    try {
        const result = await queryDB(
            'INSERT INTO public."departments" (name, dept_std_id, head_of_department, head_email, quota, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, dept_std_id, head_of_department, head_email, quota, moment().format('YYYY-MM-DD HH:mm:ss'), moment().format('YYYY-MM-DD HH:mm:ss')]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Bölüm eklenirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

app.delete('/departments/:id', verifyToken, async (req, res) => {
    const departmentId = req.params.id;
    try {
        const result = await queryDB('DELETE FROM public."departments" WHERE id = $1 RETURNING *', [departmentId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Bölüm bulunamadı' });
        } else {
            res.json({ success: true, message: 'Bölüm başarıyla silindi' });
        }
    } catch (error) {
        console.error('Bölüm silinirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

app.put('/departments/:id', verifyToken, async (req, res) => {
    const departmentId = req.params.id;
    const updatedAt = new Date();
    const { name, dept_std_id, head_of_department, head_email, quota } = req.body;
    try {
        const result = await queryDB(
            'UPDATE public."Department" SET name = $1, dept_std_id = $2, head_of_department = $3, head_email = $4, quota = $5, updated_at = $6 WHERE id = $7 RETURNING *',
            [name, dept_std_id, head_of_department, head_email, quota, updatedAt, departmentId]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: 'Bölüm bulunamadı' });
        } else {
            res.json({ success: true, data: result.rows[0] });
        }
    } catch (error) {
        console.error('Bölüm güncellenirken hata oluştu:', error);
        res.status(500).json({ success: false, error: 'Dahili sunucu hatası' });
    }
});

const PERIOD = process.env.PERIOD || 'haftalık';

function calculateBackupTime(period) {
    if (period === "dakikalık") {
        return '* * * * *';
    } else if (period === "haftalık") {
        return '0 0 * * 0';
    } else if (period === "aylık") {
        return '0 0 1 * *';
    } else {
        return '0 0 * * 0'; // weekly default
    }
}

const job = schedule.scheduleJob(calculateBackupTime(PERIOD), async function () {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup-${timestamp}.sql`;
    const backupCommand = `pg_dump --host=${process.env.PGHOST} --port=${process.env.PGPORT} --username=${process.env.PGUSER} --dbname=${process.env.PGDATABASE} --file=${backupFileName}`;

    require('child_process').exec(backupCommand, function (error, stdout, stderr) {
        if (error) {
            console.error(`Backup error: ${error}`);
            return;
        }
        console.log(`Backup successful: ${backupFileName}`);
        sendBackupEmail(backupFileName);
    });
});

const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function sendBackupEmail(backupFileName) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_TO,
        subject: 'Database Backup',
        text: 'Please find the attached database backup.',
        attachments: [
            {
                filename: backupFileName,
                path: `./${backupFileName}`,
            },
        ],
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(`Error while sending email: ${error}`);
        }
        console.log('Email sent successfully: ' + info.response);
        fs.unlink(backupFileName, (err) => {
            if (err) {
                console.error(`Error deleting file: ${err}`);
            } else {
                console.log(`Backup file ${backupFileName} deleted successfully`);
            }
        });
    });
}

app.listen(port, () => {
    console.log(`Sunucu çalışıyor. Port: ${port}`);
});
