// ===================================================================
// Jenkinsfile (Final Personalized Version)
// This pipeline is customized with your specific AWS details and
// follows the GitOps-style deployment you requested.
// ===================================================================

pipeline {
    agent any

    // ==========================================================
    // Environment Variables
    // All variables are defined here for easy management.
    // ==========================================================
    environment {
        // Your specific AWS details
        AWS_REGION         = 'us-west-2'
        AWS_ACCOUNT_ID     = '889818960214'
        ECR_REPO_NAME      = 'my-app-repo' // The single ECR repo we created
        
        // Credentials IDs as configured in Jenkins
        AWS_CREDENTIALS_ID = 'aws-credentials'
        GITHUB_TOKEN_ID    = 'my-github-pat' // Use the ID you created for the GitHub token
        
        // Dynamic image tags and URLs
        IMAGE_TAG          = "${BUILD_NUMBER}"
        BACKEND_IMAGE_URL  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-backend-${IMAGE_TAG}"
        FRONTEND_IMAGE_URL = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-frontend-${IMAGE_TAG}"
    }

    stages {
        // ==========================================================
        // Stage 1: Checkout Code
        // ==========================================================
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code from branch: ${env.BRANCH_NAME}"
                checkout scm
            }
        }

        // ==========================================================
        // Stage 2: Build, Scan & Push Images
        // ==========================================================
        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                // Use the Docker Pipeline plugin for cleaner syntax
                                def backendImage = docker.build(env.BACKEND_IMAGE_URL, '.')

                                // Login to ECR and push the image
                                docker.withRegistry("https://${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Backend image to ECR..."
                                    backendImage.push()

                                    // Scan the image AFTER pushing it (Trivy needs to pull it from the repo)
                                    echo "Scanning Backend image with Trivy..."
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${env.BACKEND_IMAGE_URL} > backend_scan_report.txt"
                                }
                                
                                // Upload scan report to S3
                                withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                                    sh "aws s3 cp backend_scan_report.txt s3://fp-statefile-bucket/backend-report-${env.IMAGE_TAG}.txt"
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                def frontendImage = docker.build(env.FRONTEND_IMAGE_URL, '.')
                                
                                docker.withRegistry("https://${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    echo "Pushing Frontend image to ECR..."
                                    frontendImage.push()

                                    echo "Scanning Frontend image with Trivy..."
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${env.FRONTEND_IMAGE_URL} > frontend_scan_report.txt"
                                }
                                
                                withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                                    sh "aws s3 cp frontend_scan_report.txt s3://fp-statefile-bucket/frontend-report-${env.IMAGE_TAG}.txt"
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // Stage 3: Update K8s Manifests in GitHub (GitOps)
        // ==========================================================
        stage('Update K8s Manifests') {
            steps {
                // Use the GitHub token credential
                withCredentials([string(credentialsId: GITHUB_TOKEN_ID, variable: 'GITHUB_TOKEN')]) {
                    // Configure Git user for this commit
                    sh 'git config user.email "jenkins@ci-cd.com"'
                    sh 'git config user.name "Jenkins CI Bot"'
                    
                    echo "Updating backend deployment manifest..."
                    // This 'sed' command replaces the image line in the specified file
                    sh "sed -i 's|image:.*|image: ${env.BACKEND_IMAGE_URL}|g' ./k8s/02-backend.yaml"
                    
                    echo "Updating frontend deployment manifest..."
                    sh "sed -i 's|image:.*|image: ${env.FRONTEND_IMAGE_URL}|g' ./k8s/03-frontend.yaml"

                    // Set up the remote URL with the token for authentication
                    sh 'git remote set-url origin https://${GITHUB_TOKEN}@github.com/MostafaAssaff/3tier-react-app.git'
                    
                    // Add, commit, and push the changes
                    sh 'git add ./k8s/02-backend.yaml ./k8s/03-frontend.yaml'
                    sh "git commit -m 'Deploy: Update image tags for build #${BUILD_NUMBER}'"
                    sh 'git push origin HEAD:main'
                }
            }
        }
    }
    
    // 5. Post-build Actions
    post {
        always {
            script {
                echo "Pipeline finished. Cleaning up workspace."
                cleanWs()
            }
        }
        success {
            echo "✅ Build and deploy successful!"
        }
        failure {
            echo "❌ Build failed."
        }
    }
}
