import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '../../lib/firebase-admin';

// GET - Fetch available jobs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const sport = searchParams.get('sport');
    const location = searchParams.get('location');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = db.collection('jobs').orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', '==', status);
    }

    if (sport && sport !== 'all') {
      query = query.where('sport', '==', sport);
    }

    if (location && location !== 'all') {
      query = query.where('location', '==', location);
    }

    query = query.limit(limit).offset(offset);

    const snapshot = await query.get();
    const jobs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate().toISOString(),
      deadline: doc.data().deadline?.toDate().toISOString(),
      updatedAt: doc.data().updatedAt?.toDate().toISOString(),
    }));

    return NextResponse.json({ jobs, total: snapshot.size });

  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

// POST - Create a new job posting
export async function POST(request: NextRequest) {
  try {
    const { 
      title, 
      description, 
      budget, 
      location, 
      sport, 
      deadline, 
      requiredSkills,
      idToken 
    } = await request.json();

    // Validate required fields
    if (!title || !description || !budget || !location || !sport || !deadline) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate budget
    if (typeof budget !== 'number' || budget <= 0) {
      return NextResponse.json(
        { error: 'Budget must be a positive number' },
        { status: 400 }
      );
    }

    // Validate deadline
    const deadlineDate = new Date(deadline);
    if (deadlineDate <= new Date()) {
      return NextResponse.json(
        { error: 'Deadline must be in the future' },
        { status: 400 }
      );
    }

    // Authenticate user (optional - allow anonymous job posting)
    let userId = null;
    let userEmail = null;
    
    if (idToken) {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        userId = decodedToken.uid;
        userEmail = decodedToken.email;
      } catch {
        console.log('Invalid token provided, creating as anonymous job');
      }
    }

    // Create job document
    const jobRef = db.collection('jobs').doc();
    const jobData = {
      id: jobRef.id,
      title,
      description,
      budget,
      location,
      sport,
      deadline: deadlineDate,
      requiredSkills: requiredSkills || [],
      postedBy: userId || 'anonymous',
      posterEmail: userEmail || null,
      status: 'open',
      applicants: 0,
      applications: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await jobRef.set(jobData);

    return NextResponse.json({
      message: 'Job posted successfully',
      ...jobData,
      createdAt: jobData.createdAt.toISOString(),
      deadline: jobData.deadline.toISOString(),
      updatedAt: jobData.updatedAt.toISOString(),
    });

  } catch (error) {
    console.error('Error creating job:', error);
    return NextResponse.json(
      { error: 'Failed to create job' },
      { status: 500 }
    );
  }
} 