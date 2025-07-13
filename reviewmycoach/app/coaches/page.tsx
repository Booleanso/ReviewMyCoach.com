'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase-client';
import { useAuth } from '../lib/hooks/useAuth';
import Link from 'next/link';
import Image from 'next/image';
import LoadingSpinner from '../components/LoadingSpinner';

interface Coach {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio: string;
  sports: string[];
  hourlyRate: number;
  location: string;
  averageRating: number;
  totalReviews: number;
  profileImage?: string;
  isVerified: boolean;
  subscriptionStatus?: string;
  specialties: string[];
}

interface Job {
  id: string;
  title: string;
  description: string;
  budget: number;
  location: string;
  sport: string;
  deadline: Date;
  requiredSkills: string[];
  postedBy: string;
  status: 'open' | 'in_progress' | 'completed';
  createdAt: Date;
  applicants?: number;
}

interface Service {
  id: string;
  coachId: string;
  coachName: string;
  title: string;
  description: string;
  price: number;
  duration: number;
  category: string;
  rating: number;
  reviews: number;
  isActive: boolean;
}

interface Course {
  id: string;
  coachId: string;
  coachName: string;
  title: string;
  description: string;
  price: number;
  duration: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  enrollments: number;
  rating: number;
  thumbnail?: string;
  sport: string;
}

export default function CoachesMarketplace() {
  const { user, isCoach } = useAuth();
  const [loading, setLoading] = useState(true);
  const [featuredCoaches, setFeaturedCoaches] = useState<Coach[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [popularServices, setPopularServices] = useState<Service[]>([]);
  const [featuredCourses, setFeaturedCourses] = useState<Course[]>([]);
  const [activeTab, setActiveTab] = useState<'jobs' | 'services' | 'courses'>('jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSport, setSelectedSport] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');

  const sports = ['Basketball', 'Football', 'Tennis', 'Soccer', 'Swimming', 'Baseball', 'Volleyball', 'Golf'];
  const locations = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego'];

  useEffect(() => {
    fetchMarketplaceData();
  }, []);

  const fetchMarketplaceData = async () => {
    try {
      await Promise.all([
        fetchFeaturedCoaches(),
        fetchAvailableJobs(),
        fetchPopularServices(),
        fetchFeaturedCourses()
      ]);
    } catch (error) {
      console.error('Error fetching marketplace data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeaturedCoaches = async () => {
    try {
      const coachesRef = collection(db, 'coaches');
      const featuredQuery = query(
        coachesRef,
        where('subscriptionStatus', '==', 'active'),
        orderBy('averageRating', 'desc'),
        limit(6)
      );
      const snapshot = await getDocs(featuredQuery);
      const coaches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Coach[];
      setFeaturedCoaches(coaches);
    } catch (error) {
      console.error('Error fetching featured coaches:', error);
    }
  };

  const fetchAvailableJobs = async () => {
    try {
      const jobsRef = collection(db, 'jobs');
      const jobsQuery = query(
        jobsRef,
        where('status', '==', 'open'),
        orderBy('createdAt', 'desc'),
        limit(8)
      );
      const snapshot = await getDocs(jobsQuery);
      const jobs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        deadline: doc.data().deadline?.toDate()
      })) as Job[];
      setAvailableJobs(jobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchPopularServices = async () => {
    try {
      const servicesRef = collection(db, 'services');
      const servicesQuery = query(
        servicesRef,
        where('isActive', '==', true),
        orderBy('totalBookings', 'desc'),
        limit(8)
      );
      const snapshot = await getDocs(servicesQuery);
      const services = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Service[];
      setPopularServices(services);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchFeaturedCourses = async () => {
    try {
      const coursesRef = collection(db, 'courses');
      const coursesQuery = query(
        coursesRef,
        where('isActive', '==', true),
        orderBy('enrollments', 'desc'),
        limit(8)
      );
      const snapshot = await getDocs(coursesQuery);
      const courses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Course[];
      setFeaturedCourses(courses);
    } catch (error) {
      console.error('Error fetching courses:', error);
    }
  };

  const formatBudget = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Find Your Coach
            </h1>
            <p className="text-gray-600 mb-8">
              Jobs, services, and courses from verified coaches
            </p>
            {isCoach && (
              <Link
                href="/subscription"
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                Upgrade to Pro
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Featured Coaches Section */}
      {featuredCoaches.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 py-12 border-b">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">
            Featured Coaches
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredCoaches.map((coach) => (
              <Link
                key={coach.id}
                href={`/coach/${coach.username}`}
                className="block border rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  {coach.profileImage ? (
                    <Image
                      src={coach.profileImage}
                      alt={coach.displayName}
                      width={48}
                      height={48}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-lg font-medium text-gray-600">
                        {coach.displayName.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">
                        {coach.displayName}
                      </h3>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        PRO
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      ⭐ {coach.averageRating.toFixed(1)} • ${coach.hourlyRate}/hr
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2 mb-2">{coach.bio}</p>
                <div className="flex gap-1">
                  {coach.sports.slice(0, 2).map((sport, index) => (
                    <span
                      key={index}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                    >
                      {sport}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <nav className="flex gap-6">
              {[
                { id: 'jobs', label: 'Jobs' },
                { id: 'services', label: 'Services' },
                { id: 'courses', label: 'Courses' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`text-sm font-medium ${
                    activeTab === tab.id
                      ? 'text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="flex gap-3">
              <select
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
                className="text-sm border rounded px-3 py-1"
              >
                <option value="all">All Sports</option>
                {sports.map(sport => (
                  <option key={sport} value={sport}>{sport}</option>
                ))}
              </select>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="text-sm border rounded px-3 py-1"
              >
                <option value="all">All Locations</option>
                {locations.map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {activeTab === 'jobs' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Available Jobs</h2>
              <Link
                href="/jobs/post"
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
              >
                Post Job
              </Link>
            </div>
            {availableJobs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No jobs available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {availableJobs.map((job) => (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 mb-1">
                          {job.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{job.description}</p>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>📍 {job.location}</span>
                          <span>🏃 {job.sport}</span>
                          <span>📅 Due: {formatDate(job.deadline)}</span>
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-semibold text-green-600">
                          {formatBudget(job.budget)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {job.requiredSkills.slice(0, 2).map((skill, index) => (
                          <span
                            key={index}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                      <button
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                        onClick={() => {
                          if (!isCoach) {
                            alert('You need to be a coach to apply for jobs!');
                            return;
                          }
                          alert('Apply feature coming soon! Subscribe to Coach Pro to access job applications.');
                        }}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'services' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Services</h2>
              {isCoach && (
                <Link
                  href="/dashboard/coach/services"
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Manage
                </Link>
              )}
            </div>
            {popularServices.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No services available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {popularServices.map((service) => (
                  <div key={service.id} className="border rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-2">
                      {service.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{service.description}</p>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-lg font-semibold text-green-600">
                        ${service.price}
                      </div>
                      <div className="text-xs text-gray-500">
                        {service.duration} min
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        by {service.coachName}
                      </div>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">
                        Book
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'courses' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Courses</h2>
              {isCoach && (
                <button
                  onClick={() => alert('Course creation requires Coach Pro subscription!')}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
              )}
            </div>
            {featuredCourses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No courses available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {featuredCourses.map((course) => (
                  <div key={course.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs px-2 py-1 rounded ${
                        course.level === 'beginner' ? 'bg-green-100 text-green-700' :
                        course.level === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {course.level}
                      </span>
                      <span className="text-xs text-gray-500">{course.sport}</span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-2">
                      {course.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{course.description}</p>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-lg font-semibold text-green-600">
                        ${course.price}
                      </div>
                      <div className="text-xs text-gray-500">
                        {course.duration}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">
                        by {course.coachName}
                      </div>
                      <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors">
                        Enroll
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      {isCoach && (
        <div className="border-t mt-12 pt-8 text-center">
          <p className="text-gray-600 mb-4">
            Unlock more features with Coach Pro
          </p>
          <Link
            href="/subscription"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Upgrade Now
          </Link>
        </div>
      )}
    </div>
  );
} 