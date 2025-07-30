import { NextRequest, NextResponse } from 'next/server';

// Lazy initialization of Firebase Admin SDK
let auth: any = null;
let db: any = null;

try {
  const firebaseAdmin = require('../../lib/firebase-admin');
  auth = firebaseAdmin.auth;
  db = firebaseAdmin.db;
} catch (error) {
  console.error('Failed to initialize Firebase Admin in classes route:', error);
}

interface ClassData {
  title: string;
  description: string;
  sport: string;
  type: 'virtual' | 'physical';
  location?: string;
  zoomLink?: string;
  maxParticipants: number;
  price: number;
  currency: string;
  duration: number; // in minutes
  schedules: {
    date: string;
    startTime: string;
    endTime: string;
  }[];
  recurringPattern?: {
    type: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate?: string;
  };
  requirements?: string[];
  equipment?: string[];
  level: 'beginner' | 'intermediate' | 'advanced' | 'all';
  tags?: string[];
}

// GET - Fetch classes
export async function GET(req: NextRequest) {
  if (!db) {
    console.error('Firebase not initialized - returning empty classes list');
    return NextResponse.json({
      classes: [],
      error: 'Firebase connection not available',
      fallback: true
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    const sport = searchParams.get('sport');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query = db.collection('classes');

    // Apply filters
    if (coachId) {
      query = query.where('coachId', '==', coachId);
    }
    if (sport) {
      query = query.where('sport', '==', sport);
    }
    if (type) {
      query = query.where('type', '==', type);
    }

    // Order by creation date and limit results
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();
    const classes = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate().toISOString(),
    }));

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('Error fetching classes:', error);
    return NextResponse.json({
      error: 'Failed to fetch classes',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST - Create new class
export async function POST(req: NextRequest) {
  if (!db || !auth) {
    console.error('Firebase not initialized - cannot create class');
    return NextResponse.json({
      error: 'Service temporarily unavailable. Please try again later.',
      details: 'Firebase connection not available'
    }, { status: 503 });
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get coach profile
    const coachQuery = await db.collection('coaches').where('userId', '==', userId).limit(1).get();
    if (coachQuery.empty) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 });
    }

    const coachDoc = coachQuery.docs[0];
    const coachData = coachDoc.data();

    // Check if coach has Stripe Connect account
    if (!coachData.stripeAccountId) {
      return NextResponse.json({
        error: 'Stripe Connect account required',
        message: 'Please connect your Stripe account before creating classes'
      }, { status: 400 });
    }

    const classData: ClassData = await req.json();

    // Validate required fields
    if (!classData.title || !classData.sport || !classData.type || !classData.schedules?.length) {
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['title', 'sport', 'type', 'schedules']
      }, { status: 400 });
    }

    // Validate virtual class requirements
    if (classData.type === 'virtual' && !classData.zoomLink) {
      return NextResponse.json({
        error: 'Zoom link required for virtual classes'
      }, { status: 400 });
    }

    // Validate physical class requirements
    if (classData.type === 'physical' && !classData.location) {
      return NextResponse.json({
        error: 'Location required for physical classes'
      }, { status: 400 });
    }

    // Create Stripe product and price for the class
    const stripe = require('../../lib/stripe');
    let stripeProductId = null;
    let stripePriceId = null;

    if (classData.price > 0) {
      try {
        const product = await stripe.stripe.products.create({
          name: classData.title,
          description: classData.description,
          metadata: {
            type: 'class',
            coachId: userId,
            sport: classData.sport,
            classType: classData.type
          }
        }, {
          stripeAccount: coachData.stripeAccountId
        });

        const price = await stripe.stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(classData.price * 100), // Convert to cents
          currency: classData.currency || 'usd',
          metadata: {
            type: 'class_booking'
          }
        }, {
          stripeAccount: coachData.stripeAccountId
        });

        stripeProductId = product.id;
        stripePriceId = price.id;
      } catch (stripeError) {
        console.error('Stripe product/price creation failed:', stripeError);
        return NextResponse.json({
          error: 'Failed to set up payment processing',
          details: 'Please check your Stripe Connect setup'
        }, { status: 500 });
      }
    }

    // Create class document
    const newClass = {
      ...classData,
      coachId: userId,
      coachName: coachData.displayName,
      stripeAccountId: coachData.stripeAccountId,
      stripeProductId,
      stripePriceId,
      participants: [],
      currentParticipants: 0,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection('classes').add(newClass);

    return NextResponse.json({
      id: docRef.id,
      ...newClass,
      createdAt: newClass.createdAt.toISOString(),
      updatedAt: newClass.updatedAt.toISOString()
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating class:', error);
    return NextResponse.json({
      error: 'Failed to create class',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// PUT - Update class
export async function PUT(req: NextRequest) {
  if (!db || !auth) {
    return NextResponse.json({
      error: 'Service temporarily unavailable'
    }, { status: 503 });
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('id');

    if (!classId) {
      return NextResponse.json({ error: 'Class ID required' }, { status: 400 });
    }

    // Check if user owns this class
    const classDoc = await db.collection('classes').doc(classId).get();
    if (!classDoc.exists) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const classData = classDoc.data();
    if (classData.coachId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updateData = await req.json();
    updateData.updatedAt = new Date();

    await db.collection('classes').doc(classId).update(updateData);

    return NextResponse.json({
      id: classId,
      ...classData,
      ...updateData,
      updatedAt: updateData.updatedAt.toISOString()
    });

  } catch (error) {
    console.error('Error updating class:', error);
    return NextResponse.json({
      error: 'Failed to update class',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// DELETE - Delete class
export async function DELETE(req: NextRequest) {
  if (!db || !auth) {
    return NextResponse.json({
      error: 'Service temporarily unavailable'
    }, { status: 503 });
  }

  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('id');

    if (!classId) {
      return NextResponse.json({ error: 'Class ID required' }, { status: 400 });
    }

    // Check if user owns this class
    const classDoc = await db.collection('classes').doc(classId).get();
    if (!classDoc.exists) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }

    const classData = classDoc.data();
    if (classData.coachId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if class has participants
    if (classData.currentParticipants > 0) {
      return NextResponse.json({
        error: 'Cannot delete class with active participants',
        message: 'Please cancel all bookings before deleting the class'
      }, { status: 400 });
    }

    await db.collection('classes').doc(classId).delete();

    return NextResponse.json({ message: 'Class deleted successfully' });

  } catch (error) {
    console.error('Error deleting class:', error);
    return NextResponse.json({
      error: 'Failed to delete class',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}