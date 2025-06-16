// ===================================================================
// Jenkinsfile (GitOps Version)
// This pipeline builds, scans, and pushes images, then updates the
// Kubernetes manifests in the Git repository. Argo CD handles deployment.
// ===================================================================

pipeline {
    agent any

    // 1. Tools
    // Tells Jenkins to find the 'SonarScanner-latest' tool (configured in Global Tools)
    // and add it to the PATH for the pipeline.
    tools {
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    // 2. Environment Variables
    // Define all necessary variables here for easy management.
    environment {
        AWS_REGION         = 'us-west-2'
        AWS_ACCOUNT_ID     = '889818960214'
        ECR_REPO_NAME      = 'my-app-repo'
        
        // Credentials IDs as configured in Jenkins
        AWS_CREDENTIALS_ID = 'aws-credentials'
        GITHUB_TOKEN_ID    = 'my-github-pat' // Use the ID you created for the GitHub token
        SONAR_CREDENTIALS  = credentials('sonar-token')
        
        // Dynamic image tags and URLs
        IMAGE_TAG          = "${BUILD_NUMBER}"
        BACKEND_IMAGE_URL  = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-backend-${IMAGE_TAG}"
        FRONTEND_IMAGE_URL = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:3tier-nodejs-frontend-${IMAGE_TAG}"
    }

    stages {
        
        stage('Checkout') {
            steps {
                echo "🔄 Checking out code..."
                checkout scm
            }
        }

        stage('SonarQube Analysis & Quality Gate') {
            steps {
                withSonarQubeEnv('MySonarQubeServer') { 
                    sh 'sonar-scanner'
                }
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                def backendImage = docker.build(env.BACKEND_IMAGE_URL, '.')
                                docker.withRegistry("https://${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    backendImage.push()
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${env.BACKEND_IMAGE_URL}"
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
                                    frontendImage.push()
                                    sh "trivy image --exit-code 0 --severity HIGH,CRITICAL ${env.FRONTEND_IMAGE_URL}"
                                }
                            }
                        }
                    }
                }
            }
        }

        // ==========================================================
        // FINAL STAGE: Update K8s Manifests in GitHub (GitOps Trigger)
        // ==========================================================
        stage('Update Manifests in Git') {
            steps {
                withCredentials([string(credentialsId: GITHUB_TOKEN_ID, variable: 'GITHUB_TOKEN')]) {
                    sh 'git config user.email "jenkins-bot@ci.com"'
                    sh 'git config user.name "Jenkins CI Bot"'
                    
                    echo "Updating backend deployment manifest..."
                    sh "sed -i 's|image:.*|image: ${env.BACKEND_IMAGE_URL}|g' ./k8s/02-backend.yaml"
                    
                    echo "Updating frontend deployment manifest..."
                    sh "sed -i 's|image:.*|image: ${env.FRONTEND_IMAGE_URL}|g' ./k8s/03-frontend.yaml"

                    sh 'git remote set-url origin https://${GITHUB_TOKEN}@github.com/MostafaAssaff/3tier-react-app.git'
                    
                    sh 'git add ./k8s/02-backend.yaml ./k8s/03-frontend.yaml'
                    sh "git commit -m 'Deploy: Update image tags for build #${BUILD_NUMBER}'"
                    sh 'git push origin HEAD:main'
                }
            }
        }
    }
    
    post {
        always {
            script {
                echo "Pipeline finished. Cleaning up workspace."
                cleanWs()
            }
        }
    }
}
