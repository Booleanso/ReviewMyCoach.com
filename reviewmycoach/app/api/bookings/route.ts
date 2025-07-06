import { NextRequest, NextResponse } from 'next/server';
import { auth } from '../../lib/firebase-admin';
import { db } from '../../lib/firebase-admin';
import { createPaymentIntent } from '../../lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { 
      idToken, 
      serviceId, 
      scheduledDate, 
      scheduledTime,
      notes,
      studentName,
      studentEmail,
      studentPhone
    } = await req.json();

    // Verify the user's authentication (optional for bookings)
    let userId = null;
    if (idToken) {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch {
        console.log('Invalid token, proceeding as guest booking');
      }
    }

    // Get service details
    const serviceRef = db.collection('services').doc(serviceId);
    const serviceDoc = await serviceRef.get();
    
    if (!serviceDoc.exists) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const serviceData = serviceDoc.data();
    if (!serviceData?.isActive) {
      return NextResponse.json({ error: 'Service is not active' }, { status: 400 });
    }

    // Check if service has reached max bookings
    if (serviceData.maxBookings && serviceData.totalBookings >= serviceData.maxBookings) {
      return NextResponse.json({ error: 'Service has reached maximum bookings' }, { status: 400 });
    }

    // Get coach's Stripe account
    const stripeAccountRef = db.collection('stripe_accounts').doc(serviceData.coachId);
    const stripeAccountDoc = await stripeAccountRef.get();
    
    if (!stripeAccountDoc.exists) {
      return NextResponse.json({ error: 'Coach payment setup not found' }, { status: 400 });
    }

    const stripeAccountData = stripeAccountDoc.data();
    const stripeAccountId = stripeAccountData?.stripeAccountId;

    if (stripeAccountData?.accountStatus !== 'active') {
      return NextResponse.json({ error: 'Coach payment setup is not active' }, { status: 400 });
    }

    // Calculate application fee (platform takes 5%)
    const applicationFeeAmount = Math.round(serviceData.price * 100 * 0.05);
    const totalAmount = serviceData.price * 100; // Convert to cents

    // Create payment intent with funds held in escrow
    const paymentIntent = await createPaymentIntent(
      totalAmount,
      'usd',
      stripeAccountId,
      applicationFeeAmount,
      {
        serviceId: serviceId,
        coachId: serviceData.coachId,
        studentId: userId || 'guest',
        bookingType: 'service',
      }
    );

    // Create booking document
    const bookingRef = db.collection('bookings').doc();
    await bookingRef.set({
      id: bookingRef.id,
      serviceId: serviceId,
      coachId: serviceData.coachId,
      studentId: userId,
      studentName,
      studentEmail,
      studentPhone,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      notes: notes || '',
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentIntentId: paymentIntent.id,
      totalAmount: serviceData.price,
      applicationFee: applicationFeeAmount / 100,
      serviceTitle: serviceData.title,
      serviceDuration: serviceData.duration,
      serviceCategory: serviceData.category,
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update service booking count
    await serviceRef.update({
      totalBookings: serviceData.totalBookings + 1,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      bookingId: bookingRef.id,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      totalAmount: serviceData.price,
      applicationFee: applicationFeeAmount / 100,
    });

  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const coachId = searchParams.get('coachId');
    const studentId = searchParams.get('studentId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query = db.collection('bookings').orderBy('createdAt', 'desc');

    if (coachId) {
      query = query.where('coachId', '==', coachId);
    }

    if (studentId) {
      query = query.where('studentId', '==', studentId);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    query = query.limit(limit);

    const snapshot = await query.get();
    const bookings = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      scheduledDate: doc.data().scheduledDate?.toDate().toISOString(),
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate().toISOString(),
    }));

    return NextResponse.json({ bookings });

  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { idToken, bookingId, status, completionNotes, deliverables } = await req.json();

    // Verify the user's authentication
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get booking details
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingDoc = await bookingRef.get();
    
    if (!bookingDoc.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const bookingData = bookingDoc.data();
    
    // Check if user is the coach for this booking
    if (bookingData?.coachId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'completed') {
      updateData.isCompleted = true;
      updateData.completedAt = new Date();
      updateData.completionNotes = completionNotes || '';
      updateData.deliverables = deliverables || [];
    }

    await bookingRef.update(updateData);

    return NextResponse.json({ message: 'Booking updated successfully' });

  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { error: 'Failed to update booking' },
      { status: 500 }
    );
  }
} 